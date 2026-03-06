import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, convertToModelMessages, UIMessage, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { createOrUpdateArtwork, getProjectArtwork, getProjectMessages, saveMessage } from '@/lib/db/projects-service';
import { resizeImage } from '@/lib/image-processing';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { assets, teams, teamMembers, agentSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getFileBuffer, uploadFile, ensureBucket } from '@/lib/storage';
import { randomUUID } from 'crypto';
import { users } from '@/lib/db/schema';
import sharp from 'sharp';

export const maxDuration = 60;

// Temporary state for dimensions during creation
const tempDimensions = new Map<string, { width: number; height: number }>();
const tempPageCounts = new Map<string, number>();

const PAGE_BREAK = '\n<!-- PAGE_BREAK -->\n';
const PAGE_BREAK_LEGACY_GUIDENCO = '\n<!-- GUIDENCO_PAGE_BREAK -->\n';
const PAGE_BREAK_LEGACY_ARTISTE = '\n<!-- ARTISTE_PAGE_BREAK -->\n';

function splitPages(html: string): string[] {
  if (!html) return [''];
  // Normalise legacy separators so old artworks split correctly
  const normalised = html
    .split(PAGE_BREAK_LEGACY_GUIDENCO).join(PAGE_BREAK)
    .split(PAGE_BREAK_LEGACY_ARTISTE).join(PAGE_BREAK);
  const parts = normalised.split(PAGE_BREAK);
  return parts.length > 0 ? parts : [''];
}

function joinPages(pages: string[]): string {
  return pages.join(PAGE_BREAK);
}

function clampPageIndex(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.min(Math.max(0, pageIndex), pageCount - 1);
}

async function getUserTeamAndAgentSettings(userId: string) {
  // Check if user is a team owner
  const ownedTeam = await db
    .select()
    .from(teams)
    .where(eq(teams.ownerId, userId))
    .limit(1);

  let team;
  if (ownedTeam.length > 0) {
    team = ownedTeam[0];
  } else {
    // Check if user is a member of a team
    const membership = await db
      .select({ team: teams })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId))
      .limit(1);

    if (membership.length > 0) {
      team = membership[0].team;
    } else {
      // Create a default team for this user
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const teamName = user[0]?.name ? `${user[0].name}'s Team` : 'My Team';

      const [newTeam] = await db
        .insert(teams)
        .values({ name: teamName, ownerId: userId })
        .returning();
      team = newTeam;
    }
  }

  // Get agent settings for this team
  const agentData = await db
    .select()
    .from(agentSettings)
    .where(eq(agentSettings.teamId, team.id))
    .limit(1);

  return {
    team,
    designGuidelines: agentData[0]?.designGuidelines || ''
  };
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const selectedPageIndexParam = searchParams.get('pageIndex');
  const selectedPageIndex = selectedPageIndexParam ? Number(selectedPageIndexParam) : 0;
  const defaultSelectedPageIndex = Number.isFinite(selectedPageIndex) && selectedPageIndex >= 0 ? selectedPageIndex : 0;

  if (!projectId) {
    return new Response('Project ID required', { status: 400 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  // Save the last user message to database
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage && lastUserMessage.role === 'user') {
    await saveMessage(projectId, 'user', lastUserMessage.parts || []);
  }

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const modelId = (process.env.OPENROUTER_MODEL || '').trim() || 'google/gemini-2.5-pro';

  // Get session and agent settings
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { designGuidelines } = await getUserTeamAndAgentSettings(session.user.id);

  // Manually convert messages to handle images properly
  const convertedMessages = await Promise.all(messages.map(async (msg: any) => {
    const content: any[] = [];

    for (const part of msg.parts || []) {
      if (part.type === 'text') {
        content.push({ type: 'text', text: part.text });
      } else if (part.type === 'image') {
        let imageContent = part.image;
        try {
          // Resize uploaded images to save tokens
          imageContent = await resizeImage(part.image);
        } catch (e) {
          console.error('Failed to resize uploaded image:', e);
        }

        content.push({
          type: 'image',
          image: imageContent,
          mimeType: part.mimeType || 'image/png'
        });

        // If this image was uploaded to the warehouse, tell the LLM its permanent URL
        if (part.fileUrl) {
          content.push({
            type: 'text',
            text: `[Image uploaded to Design Warehouse. Permanent URL: ${part.fileUrl} — use this URL in <img src="..."> tags when embedding this image in artwork.]`,
          });
        }
      }
    }

    return {
      role: msg.role,
      content: content.length > 0 ? content : [{ type: 'text', text: '' }]
    };
  }));

  const result = streamText({
    model: openrouter(modelId),
    messages: convertedMessages as any,
    stopWhen: stepCountIs(5),
    system: `You are an AI assistant that helps users create digital assets using HTML, Tailwind CSS, and FontAwesome icons.

Current context:
- The user currently has pageIndex=${defaultSelectedPageIndex} selected in the UI.
- If the user asks to edit or inspect a page without specifying which one, prefer using this selectedPageIndex.

${designGuidelines ? `TEAM DESIGN GUIDELINES:
${designGuidelines}

IMPORTANT: Follow these design guidelines closely when creating or modifying artwork. They represent your team's brand standards and design preferences.` : ''}

You have access to tools to:
1. Create an artwork with specific dimensions (container size) and number of pages
2. Write HTML with Tailwind CSS classes, FontAwesome icons, and Google Fonts (optionally targeting a specific page)
   - For multi-page initial creation, you can write ALL pages at once in a single version using writePagesHTML.
3. Make surgical edits to existing HTML by finding and replacing specific parts (editHTML)
4. Create/delete pages
5. View the current artwork state (optionally for a specific page) - this returns BOTH the HTML code AND a rendered image of what it looks like

When a user asks you to create something:
1. First, create an artwork with appropriate dimensions using the createArtwork tool (ONLY call this once per artwork)
   - If the user needs multiple pages, set pageCount accordingly.
2. Then, write HTML:
   - If there are multiple pages, prefer using writePagesHTML ONCE to write all pages in a single version.
   - Otherwise use writeHTML.
   - Each writeHTML/writePagesHTML call creates a new version.
3. For HTML, use:
   - Tailwind CSS for styling
   - FontAwesome icons (e.g., <i class="fas fa-heart"></i>)
   - Google Fonts by specifying the googleFonts parameter (e.g., ["Roboto", "Playfair Display"])
   - Use font-family CSS or Tailwind's arbitrary values to apply fonts: style="font-family: 'Roboto'" or class="font-['Roboto']"
   - If there are multiple pages, pass pageIndex to writeHTML to edit a specific page.
4. After writing HTML, ALWAYS call getArtworkState (with pageIndex if relevant) to verify the output matches the user's requirements
   - The getArtworkState tool will show you an IMAGE of the rendered artwork
   - LOOK AT THE IMAGE carefully to verify it matches what the user requested
   - The image field contains a base64-encoded PNG showing exactly what the artwork looks like
4. If the rendered image doesn't match requirements, call writeHTML again with corrections

When a user asks you to UPDATE or MODIFY existing artwork:
- DO NOT call createArtwork again - this will reset the version history
- First, call getArtworkState (with pageIndex if relevant) to see the current HTML AND the rendered image
- For SMALL, TARGETED changes (like changing colors, text, or specific elements):
  * Use editHTML to make surgical edits by finding and replacing specific parts
  * This is more efficient and preserves the rest of the code
  * Example: changing a button color, updating text, modifying a single element
- For LARGE changes or complete redesigns:
  * Use writeHTML to rewrite the entire page
- After editing, call getArtworkState again (with pageIndex if relevant) to verify the changes
- Each editHTML or writeHTML call creates a new version automatically

Guidelines:
- Use Tailwind CSS utility classes for all styling (e.g., bg-blue-500, text-white, rounded-lg, flex, etc.)
- Use FontAwesome icons with <i class="fas fa-icon-name"></i> or <i class="fab fa-icon-name"></i>
- Create responsive, modern designs with proper spacing and colors
- The HTML will be rendered in a container, so use relative units and flexbox/grid for layouts
- You can use any Tailwind classes and FontAwesome icons
- IMPORTANT: For writeHTML, write the COMPLETE HTML from scratch. It will replace the previous version, not append to it.
- For small updates, prefer editHTML over writeHTML to make targeted changes without rewriting everything.
- Use writeHTML for initial creation or major redesigns, use editHTML for tweaks and modifications.
- You can search for images using the searchImage tool and use the returned URLs in <img> tags
- Choose dimensions that match the desired output size (e.g., 800x600 for a web banner, 1080x1080 for social media)

ELEMENT EDIT REQUESTS:
- When a message starts with "[ELEMENT EDIT REQUEST]", the user has selected a specific element in the preview.
- The message will include the CSS selector, element label, and current outerHTML of the selected element.
- For these requests:
  1. Call getArtworkState first to get the full current HTML of the page.
  2. Use editHTML to make a SURGICAL find/replace that only modifies the specific element identified by the CSS selector and outerHTML provided.
  3. The find string must match the element's current outerHTML (or a unique fragment of it) EXACTLY as shown in the message.
  4. The replace string should be the same element with only the requested change applied.
  5. DO NOT change anything outside of that element.
  6. After editing, call getArtworkState to verify only the targeted element changed.

DESIGN WAREHOUSE:
- Your team has a Design Warehouse with uploaded assets (images, PDFs, logos, etc.).
- Use the listAssets tool to discover available assets. Do this when the user mentions "my logo", "our brand image", "the uploaded file", or anything that suggests they have pre-uploaded content.
- Use inspectAsset to view an asset's content (returns a rendered image for images/PDFs) so you can understand what it looks like before using it.
- To embed an asset in artwork, use its proxyUrl (/api/assets/image?id=...) in <img> tags or as CSS background-image values. Always use the actual URL from the asset, not a placeholder.
- If the user says "use my asset" or references something by name, list assets first, find the matching one, then use its proxyUrl.

SVG CREATION:
- Use the createSVG tool to generate a custom SVG graphic from scratch using an AI sub-agent.
- The SVG is automatically saved to the Design Warehouse with source "generated".
- After creation, use the returned proxyUrl in <img src="..."> tags in artwork — SVGs are perfectly scalable.
- Great for logos, icons, illustrations, badges, decorative elements, and any vector graphic.
- Always call createSVG when the user asks to "create a logo", "make an icon", "generate a graphic", or any vector/SVG asset.

CRITICAL COMMUNICATION RULES:
- ALWAYS provide a text response after using tools to explain what you did and the result
- After calling createArtwork, explain what you created
- After calling writeHTML or editHTML, describe the changes you made
- After calling getArtworkState, comment on what you see in the rendered image
- Never end your response with just tool calls - always add explanatory text
- Be conversational and helpful - let the user know you've completed their request
- If you made changes, briefly describe what changed and why

Always use the tools to create the artwork. The user will see the visual output in real-time.`,
    tools: {
      createArtwork: tool({
        description: 'Create a new artwork container with specified width and height.',
        inputSchema: z.object({
          width: z.number().describe('Width of the artwork in pixels'),
          height: z.number().describe('Height of the artwork in pixels'),
          pageCount: z.number().int().min(1).max(50).optional().describe('How many pages to create (default: 1)'),
        }),
        execute: async ({ width, height, pageCount = 1 }: { width: number; height: number; pageCount?: number }) => {
          // Store dimensions temporarily for writeHTML
          tempDimensions.set(projectId, { width, height });
          tempPageCounts.set(projectId, pageCount);
          return {
            success: true,
            message: `Artwork created with dimensions ${width}x${height}`,
            width,
            height,
            pageCount,
          };
        },
      }),
      writeHTML: tool({
        description: 'Write Handlebars template with Tailwind CSS classes, FontAwesome icons, and optional Google Fonts. This will REPLACE the current template with a new version. Available Handlebars helpers: {{#each (range 1 10)}} for loops, {{#if (odd @index)}} or {{#if (even @index)}} for conditionals, {{variable}} for data.',
        inputSchema: z.object({
          html: z.string().describe('Complete Handlebars template with Tailwind CSS classes. Use plain HTML for static content. Available helpers: (range start end) creates array from start to end, (odd number) checks if odd, (even number) checks if even. Example: {{#each (range 1 5)}}<div>{{this}}</div>{{/each}}. Use FontAwesome icons with <i class="fas fa-icon-name"></i>. For Google Fonts, use font-family in style or Tailwind classes.'),
          googleFonts: z.array(z.string()).optional().describe('Array of Google Font family names to load (e.g., ["Roboto", "Open Sans", "Playfair Display"]). These will be automatically loaded from Google Fonts.'),
          pageIndex: z.number().int().min(0).optional().describe('If provided, updates only this page (0-based index) instead of replacing the entire multi-page document.'),
        }),
        execute: async ({
          html,
          googleFonts,
          pageIndex,
        }: {
          html: string;
          googleFonts?: string[];
          pageIndex?: number;
        }) => {
          try {
            // Get dimensions from temp storage or existing artwork
            let dimensions = tempDimensions.get(projectId);
            const requestedPageCount = tempPageCounts.get(projectId);

            if (!dimensions) {
              const existingArtwork = await getProjectArtwork(projectId);
              if (existingArtwork) {
                dimensions = { width: existingArtwork.width, height: existingArtwork.height };
              } else {
                return {
                  success: false,
                  error: 'No artwork exists. Please create an artwork first using createArtwork.',
                };
              }
            }

            let htmlToStore = html;
            if (typeof pageIndex === 'number') {
              const existingArtwork = await getProjectArtwork(projectId);
              const existingFullHTML = existingArtwork
                ? existingArtwork.versions[existingArtwork.currentVersion]?.html || ''
                : '';

              let pages = splitPages(existingFullHTML);

              if ((!existingArtwork || pages.length === 1) && requestedPageCount && requestedPageCount > 1) {
                pages = Array.from({ length: requestedPageCount }, () => '');
              }

              const safeIndex = clampPageIndex(pageIndex, pages.length);
              pages[safeIndex] = html;
              htmlToStore = joinPages(pages);
            } else if (requestedPageCount && requestedPageCount > 1) {
              const pages = Array.from({ length: requestedPageCount }, () => '');
              pages[0] = html;
              htmlToStore = joinPages(pages);
            }

            // Save to database
            const { currentVersion, totalVersions } = await createOrUpdateArtwork(
              projectId,
              dimensions.width,
              dimensions.height,
              htmlToStore,
              googleFonts || []
            );

            // Clear temp dimensions
            tempDimensions.delete(projectId);
            tempPageCounts.delete(projectId);

            const storedPages = splitPages(htmlToStore);
            const resolvedPageIndex = typeof pageIndex === 'number' ? clampPageIndex(pageIndex, storedPages.length) : 0;

            // Create message with page info if editing a specific page
            let message = `HTML updated successfully (Version ${currentVersion + 1})`;
            if (typeof pageIndex === 'number' && storedPages.length > 1) {
              message = `HTML updated successfully for page ${resolvedPageIndex + 1} of ${storedPages.length} (Version ${currentVersion + 1})`;
            }

            return {
              success: true,
              message,
              html: typeof pageIndex === 'number' ? storedPages[resolvedPageIndex] : htmlToStore,
              version: currentVersion,
              totalVersions,
              width: dimensions.width,
              height: dimensions.height,
              pageCount: storedPages.length,
              pageIndex: resolvedPageIndex,
            };
          } catch (error: any) {
            console.error('Error in writeHTML:', error);
            return {
              success: false,
              error: `Failed to write HTML: ${error.message}`,
            };
          }
        },
      }),
      editHTML: tool({
        description: 'Make surgical edits to existing HTML by finding and replacing specific parts. Use this for targeted changes like updating text, colors, or specific elements without rewriting the entire page. More efficient than writeHTML for small changes.',
        inputSchema: z.object({
          findString: z.string().describe('The exact HTML string to find and replace. Must be unique in the page. Include enough context to make it unique.'),
          replaceString: z.string().describe('The new HTML string to replace it with.'),
          pageIndex: z.number().int().min(0).optional().describe('If provided, edits only this page (0-based index). Otherwise edits the currently selected page.'),
        }),
        execute: async ({
          findString,
          replaceString,
          pageIndex,
        }: {
          findString: string;
          replaceString: string;
          pageIndex?: number;
        }) => {
          try {
            const artwork = await getProjectArtwork(projectId);
            if (!artwork) {
              return {
                success: false,
                error: 'No artwork exists. Please create an artwork first using createArtwork.',
              };
            }

            const currentHTML = artwork.versions[artwork.currentVersion]?.html || '';
            const currentFonts = artwork.versions[artwork.currentVersion]?.googleFonts || [];
            const pages = splitPages(currentHTML);

            // Determine which page to edit
            const targetPageIndex = typeof pageIndex === 'number'
              ? clampPageIndex(pageIndex, pages.length)
              : clampPageIndex(defaultSelectedPageIndex, pages.length);

            const pageHTML = pages[targetPageIndex] || '';

            // Check if findString exists in the page
            if (!pageHTML.includes(findString)) {
              return {
                success: false,
                error: `Could not find the specified string in page ${targetPageIndex + 1}. Make sure the findString exactly matches the HTML you want to replace.`,
              };
            }

            // Check if findString appears multiple times
            const occurrences = pageHTML.split(findString).length - 1;
            if (occurrences > 1) {
              return {
                success: false,
                error: `The findString appears ${occurrences} times in the page. Please provide a more specific string that appears only once.`,
              };
            }

            // Perform the replacement
            const updatedPageHTML = pageHTML.replace(findString, replaceString);
            pages[targetPageIndex] = updatedPageHTML;
            const htmlToStore = joinPages(pages);

            // Save to database
            const { currentVersion, totalVersions } = await createOrUpdateArtwork(
              projectId,
              artwork.width,
              artwork.height,
              htmlToStore,
              currentFonts
            );

            // Create message with page info
            let message = `HTML edited successfully (Version ${currentVersion + 1})`;
            if (pages.length > 1) {
              message = `HTML edited successfully for page ${targetPageIndex + 1} of ${pages.length} (Version ${currentVersion + 1})`;
            }

            return {
              success: true,
              message,
              version: currentVersion,
              totalVersions,
              width: artwork.width,
              height: artwork.height,
              pageCount: pages.length,
              pageIndex: targetPageIndex,
            };
          } catch (error: any) {
            console.error('Error in editHTML:', error);
            return {
              success: false,
              error: `Failed to edit HTML: ${error.message}`,
            };
          }
        },
      }),
      writePagesHTML: tool({
        description: 'Write ALL pages of a multi-page artwork in a SINGLE version. Use this for initial multi-page creation when you want one version to contain the full document.',
        inputSchema: z.object({
          pages: z.array(z.string()).min(1).max(50).describe('Array of page HTML strings, in order. Each entry is the COMPLETE HTML for that page.'),
          googleFonts: z.array(z.string()).optional().describe('Array of Google Font family names to load (e.g., ["Roboto", "Open Sans", "Playfair Display"]). These will be automatically loaded from Google Fonts.'),
        }),
        execute: async ({
          pages,
          googleFonts,
        }: {
          pages: string[];
          googleFonts?: string[];
        }) => {
          try {
            // Get dimensions from temp storage or existing artwork
            let dimensions = tempDimensions.get(projectId);
            const requestedPageCount = tempPageCounts.get(projectId);

            if (!dimensions) {
              const existingArtwork = await getProjectArtwork(projectId);
              if (existingArtwork) {
                dimensions = { width: existingArtwork.width, height: existingArtwork.height };
              } else {
                return {
                  success: false,
                  error: 'No artwork exists. Please create an artwork first using createArtwork.',
                };
              }
            }

            const desiredCount = requestedPageCount && requestedPageCount > 0 ? requestedPageCount : pages.length;
            const normalizedPages = Array.from({ length: desiredCount }, (_, idx) => pages[idx] ?? '');
            const htmlToStore = joinPages(normalizedPages);

            const { currentVersion, totalVersions } = await createOrUpdateArtwork(
              projectId,
              dimensions.width,
              dimensions.height,
              htmlToStore,
              googleFonts || []
            );

            tempDimensions.delete(projectId);
            tempPageCounts.delete(projectId);

            return {
              success: true,
              message: `HTML updated successfully (Version ${currentVersion + 1})`,
              version: currentVersion,
              totalVersions,
              width: dimensions.width,
              height: dimensions.height,
              pageCount: normalizedPages.length,
            };
          } catch (error: any) {
            console.error('Error in writePagesHTML:', error);
            return {
              success: false,
              error: `Failed to write pages HTML: ${error.message}`,
            };
          }
        },
      }),
      createPage: tool({
        description: 'Create a new blank page in the current artwork. By default it appends a page to the end. This creates a new version.',
        inputSchema: z.object({
          afterPageIndex: z.number().int().min(-1).optional().describe('Insert the new page after this 0-based index. Use -1 to insert at the beginning. Defaults to append.'),
        }),
        execute: async ({ afterPageIndex }: { afterPageIndex?: number }) => {
          try {
            const artwork = await getProjectArtwork(projectId);
            if (!artwork) {
              return {
                success: false,
                error: 'No artwork exists yet. Create one first using createArtwork.',
              };
            }

            const currentHTML = artwork.versions[artwork.currentVersion]?.html || '';
            const currentFonts = artwork.versions[artwork.currentVersion]?.googleFonts || [];

            const pages = splitPages(currentHTML);
            const insertAfter = typeof afterPageIndex === 'number' ? afterPageIndex : pages.length - 1;
            const insertAt = Math.min(Math.max(insertAfter + 1, 0), pages.length);

            const nextPages = [...pages.slice(0, insertAt), '', ...pages.slice(insertAt)];
            const nextHTML = joinPages(nextPages);

            const { currentVersion, totalVersions } = await createOrUpdateArtwork(
              projectId,
              artwork.width,
              artwork.height,
              nextHTML,
              currentFonts
            );

            return {
              success: true,
              message: `Page created (Version ${currentVersion + 1})`,
              pageCount: nextPages.length,
              pageIndex: insertAt,
              version: currentVersion,
              totalVersions,
            };
          } catch (error: any) {
            console.error('Error in createPage:', error);
            return {
              success: false,
              error: `Failed to create page: ${error.message}`,
            };
          }
        },
      }),
      deletePage: tool({
        description: 'Delete a page from the current artwork by 0-based pageIndex. This creates a new version. You cannot delete the last remaining page.',
        inputSchema: z.object({
          pageIndex: z.number().int().min(0).describe('0-based index of the page to delete.'),
        }),
        execute: async ({ pageIndex }: { pageIndex: number }) => {
          try {
            const artwork = await getProjectArtwork(projectId);
            if (!artwork) {
              return {
                success: false,
                error: 'No artwork exists yet. Create one first using createArtwork.',
              };
            }

            const currentHTML = artwork.versions[artwork.currentVersion]?.html || '';
            const currentFonts = artwork.versions[artwork.currentVersion]?.googleFonts || [];

            const pages = splitPages(currentHTML);
            if (pages.length <= 1) {
              return {
                success: false,
                error: 'Cannot delete the last remaining page.',
              };
            }

            if (pageIndex < 0 || pageIndex >= pages.length) {
              return {
                success: false,
                error: `Invalid pageIndex. Must be between 0 and ${pages.length - 1}.`,
              };
            }

            const nextPages = pages.filter((_, idx) => idx !== pageIndex);
            const nextHTML = joinPages(nextPages);

            const { currentVersion, totalVersions } = await createOrUpdateArtwork(
              projectId,
              artwork.width,
              artwork.height,
              nextHTML,
              currentFonts
            );

            return {
              success: true,
              message: `Page deleted (Version ${currentVersion + 1})`,
              pageCount: nextPages.length,
              deletedPageIndex: pageIndex,
              version: currentVersion,
              totalVersions,
            };
          } catch (error: any) {
            console.error('Error in deletePage:', error);
            return {
              success: false,
              error: `Failed to delete page: ${error.message}`,
            };
          }
        },
      }),
      getArtworkState: tool({
        description: 'Get the current state of the artwork including dimensions, HTML code, and a rendered image. Use this to see what has been created so far and make improvements.',
        inputSchema: z.object({
          pageIndex: z.number().int().min(0).optional().describe('If provided, returns state for this specific page (0-based).'),
        }),
        execute: async ({ pageIndex }: { pageIndex?: number }) => {
          try {
            const artwork = await getProjectArtwork(projectId);
            if (!artwork) {
              return {
                success: false,
                error: 'No artwork exists yet. Create one first using createArtwork.',
              };
            }

            const currentHTML = artwork.versions[artwork.currentVersion]?.html || '';
            const currentFonts = artwork.versions[artwork.currentVersion]?.googleFonts || [];

            const pages = splitPages(currentHTML);
            const requestedIndex = typeof pageIndex === 'number' ? pageIndex : defaultSelectedPageIndex;
            const resolvedPageIndex = clampPageIndex(requestedIndex, pages.length);
            const pageHTML = pages[resolvedPageIndex] || '';

            // Render the template to an image
            let imageData = null;
            try {
              const renderResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  template: pageHTML,
                  width: artwork.width,
                  height: artwork.height,
                  format: 'base64',
                  googleFonts: currentFonts,
                }),
              });

              if (renderResponse.ok) {
                const renderData = await renderResponse.json();
                imageData = renderData.image;

                // Resize rendered image to save tokens
                if (imageData) {
                  try {
                    imageData = await resizeImage(imageData);
                  } catch (e) {
                    console.error('Failed to resize artwork state image:', e);
                  }
                }

                console.log('🖼️ Image rendered for LLM:', imageData ? `${imageData.substring(0, 50)}...` : 'null');
              } else {
                console.error('Failed to render image:', await renderResponse.text());
              }
            } catch (renderError) {
              console.error('Error rendering image:', renderError);
            }

            const result = {
              success: true,
              width: artwork.width,
              height: artwork.height,
              html: pageHTML,
              fullHtml: currentHTML,
              image: imageData,
              version: artwork.currentVersion,
              totalVersions: artwork.versions.length,
              pageCount: pages.length,
              pageIndex: resolvedPageIndex,
            };

            console.log('📊 getArtworkState returning:', {
              ...result,
              image: result.image ? `${result.image.substring(0, 50)}... (${result.image.length} chars)` : 'null',
            });

            return result;
          } catch (error: any) {
            console.error('Error in getArtworkState:', error);
            return {
              success: false,
              error: `Error getting artwork state: ${error.message}`,
            };
          }
        },
      }),
      searchImage: tool({
        description: 'Search for images on Unsplash and get image URLs. Returns high-quality, free-to-use images.',
        inputSchema: z.object({
          query: z.string().describe('Search term for the image (e.g., "mountain sunset", "coffee cup", "abstract art")'),
          count: z.number().optional().describe('Number of images to return (default: 1, max: 5)'),
        }),
        execute: async ({ query, count = 1 }: { query: string; count?: number }) => {
          try {
            const perPage = Math.min(count, 5);
            const response = await fetch(
              `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`,
              {
                headers: {
                  'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
                },
              }
            );

            if (!response.ok) {
              return {
                success: false,
                error: 'Failed to search images',
              };
            }

            const data = await response.json();
            const images = data.results.map((img: any) => ({
              url: img.urls.regular,
              thumbnail: img.urls.small,
              width: img.width,
              height: img.height,
              description: img.description || img.alt_description,
              photographer: img.user.name,
            }));

            return {
              success: true,
              query,
              images,
              count: images.length,
            };
          } catch (error) {
            return {
              success: false,
              error: 'Error searching for images',
            };
          }
        },
      }),
      listAssets: tool({
        description: 'List all assets in the team\'s Design Warehouse (uploaded images, PDFs, logos, etc.). Use this when the user references "my logo", "our brand image", uploaded files, or any pre-existing assets.',
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const session = await auth.api.getSession({ headers: await headers() });
            if (!session) return { success: false, error: 'Not authenticated', assets: [] };

            const userId = session.user.id;
            const ownedTeam = await db.select({ id: teams.id }).from(teams).where(eq(teams.ownerId, userId)).limit(1);
            let teamId = ownedTeam[0]?.id;

            if (!teamId) {
              const membership = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId)).limit(1);
              teamId = membership[0]?.teamId;
            }

            if (!teamId) return { success: true, assets: [], message: 'No team found — no assets available.' };

            const teamAssets = await db.select().from(assets).where(eq(assets.teamId, teamId));
            return {
              success: true,
              assets: teamAssets.map(a => ({
                id: a.id,
                title: a.title,
                description: a.description,
                fileUrl: a.fileUrl,
                mimeType: a.mimeType,
              })),
            };
          } catch (error) {
            return { success: false, error: 'Failed to list assets', assets: [] };
          }
        },
      }),
      inspectAsset: tool({
        description: 'Inspect a specific asset from the Design Warehouse. Returns a rendered image of the asset (works for PNG, JPEG, PDF). Use this to see what an asset looks like before embedding it in artwork.',
        inputSchema: z.object({
          assetId: z.string().describe('The ID of the asset to inspect (from listAssets)'),
        }),
        execute: async ({ assetId }: { assetId: string }) => {
          try {
            const asset = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
            if (!asset.length) return { success: false, error: 'Asset not found' };

            const a = asset[0];
            const buffer = await getFileBuffer(a.fileKey);

            if (a.mimeType === 'application/pdf') {
              // Render first page of PDF via the render API
              const renderResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfBuffer: buffer.toString('base64'), format: 'base64', width: 800, height: 600 }),
              });
              if (renderResponse.ok) {
                const data = await renderResponse.json();
                return { success: true, title: a.title, description: a.description, mimeType: a.mimeType, fileUrl: a.fileUrl, proxyUrl: `/api/assets/image?id=${a.id}`, image: data.image };
              }
              return { success: true, title: a.title, description: a.description, mimeType: a.mimeType, fileUrl: a.fileUrl, proxyUrl: `/api/assets/image?id=${a.id}` };
            }

            const base64 = buffer.toString('base64');
            return {
              success: true,
              title: a.title,
              description: a.description,
              mimeType: a.mimeType,
              fileUrl: a.fileUrl,
              proxyUrl: `/api/assets/image?id=${a.id}`,
              image: `data:${a.mimeType};base64,${base64}`,
            };
          } catch (error) {
            return { success: false, error: 'Failed to inspect asset' };
          }
        },
      }),
      createSVG: tool({
        description: 'Generate a custom SVG graphic using an AI sub-agent and save it to the Design Warehouse automatically. Returns the asset ID and a proxyUrl to embed it in artwork. Use for logos, icons, illustrations, badges, and any vector graphic.',
        inputSchema: z.object({
          prompt: z.string().describe('Detailed description of the SVG to create, e.g. "a minimalist mountain logo with a purple-to-blue gradient"'),
          title: z.string().describe('Name for this asset in the Design Warehouse, e.g. "Mountain Logo"'),
          width: z.number().optional().describe('SVG viewBox width in pixels (default: 400)'),
          height: z.number().optional().describe('SVG viewBox height in pixels (default: 400)'),
        }),
        execute: async ({ prompt, title, width = 400, height = 400 }: { prompt: string; title: string; width?: number; height?: number }) => {
          try {
            // ── 1. Call the SVG sub-agent ────────────────────────────────────
            const svgModelId = (process.env.SVG_MODEL || '').trim() || 'google/gemini-2.5-flash';

            const svgResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: svgModelId,
                messages: [
                  {
                    role: 'system',
                    content: `You are an expert SVG designer. Generate clean, high-quality SVG vector graphics.
STRICT RULES:
- Return ONLY the raw SVG code — no markdown fences, no explanation, no extra text
- Begin with <svg and end with </svg>
- Always include xmlns="http://www.w3.org/2000/svg" and viewBox="0 0 ${width} ${height}"
- The SVG must be fully self-contained (no external images, no external fonts)
- Use fills, gradients, paths, and shapes to create a visually polished, professional result
- Keep the output under 8000 characters`,
                  },
                  {
                    role: 'user',
                    content: `Create an SVG graphic: ${prompt}`,
                  },
                ],
                max_tokens: 4096,
                temperature: 0.7,
              }),
            });

            if (!svgResponse.ok) {
              const errText = await svgResponse.text();
              console.error('SVG sub-agent error:', errText);
              return { success: false, error: 'SVG generation failed — sub-agent returned an error' };
            }

            const svgData = await svgResponse.json();
            let svgContent: string = svgData.choices?.[0]?.message?.content?.trim() ?? '';

            // Strip markdown fences if the model wrapped the SVG anyway
            const svgMatch = svgContent.match(/<svg[\s\S]*<\/svg>/i);
            if (svgMatch) svgContent = svgMatch[0];

            if (!svgContent.toLowerCase().startsWith('<svg')) {
              return { success: false, error: 'Sub-agent did not return valid SVG content' };
            }

            // Ensure proper XML namespace
            if (!svgContent.includes('xmlns')) {
              svgContent = svgContent.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            }

            // ── 2. Resolve the user's team ───────────────────────────────────
            const session = await auth.api.getSession({ headers: await headers() });
            if (!session) return { success: false, error: 'Not authenticated' };

            const userId = session.user.id;

            // Find existing team (owned or member)
            let teamId: string | undefined;
            const ownedTeam = await db.select({ id: teams.id }).from(teams).where(eq(teams.ownerId, userId)).limit(1);
            teamId = ownedTeam[0]?.id;

            if (!teamId) {
              const membership = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId)).limit(1);
              teamId = membership[0]?.teamId;
            }

            // Lazily create a personal team if none exists
            if (!teamId) {
              const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
              const teamName = user[0]?.name ? `${user[0].name}'s Team` : 'My Team';
              const [newTeam] = await db.insert(teams).values({ name: teamName, ownerId: userId }).returning();
              teamId = newTeam.id;
            }

            // ── 3. Store SVG in S3/MinIO ─────────────────────────────────────
            await ensureBucket();
            const key = `assets/${teamId}/${randomUUID()}.svg`;
            const buffer = Buffer.from(svgContent, 'utf-8');
            const fileUrl = await uploadFile(key, buffer, 'image/svg+xml');

            // ── 4. Persist to assets table ───────────────────────────────────
            const [asset] = await db
              .insert(assets)
              .values({
                teamId,
                uploadedBy: userId,
                title,
                description: prompt,
                fileKey: key,
                fileUrl,
                mimeType: 'image/svg+xml',
                source: 'generated',
              })
              .returning();

            // Convert SVG to PNG for the inline chat card preview.
            // SVG data URLs in <img> tags are browser-sandboxed and often broken;
            // PNG renders universally without any restrictions.
            let imageDataUrl = `data:image/svg+xml;base64,${buffer.toString('base64')}`;
            try {
              const pngBuffer = await sharp(buffer).png().toBuffer();
              imageDataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
            } catch (convErr) {
              console.error('SVG→PNG conversion failed for chat preview, falling back to SVG data URL:', convErr);
            }

            return {
              success: true,
              assetId: asset.id,
              title: asset.title,
              proxyUrl: `/api/assets/image?id=${asset.id}`,
              fileUrl: asset.fileUrl,
              image: imageDataUrl,
              message: `SVG "${title}" created and saved to Design Warehouse.`,
            };
          } catch (error) {
            console.error('createSVG error:', error);
            return { success: false, error: 'Failed to create SVG' };
          }
        },
      }),
    },
    onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
      // Save each step as a separate message for better timeline
      try {
        const parts: any[] = [];

        console.log('📝 Step finished - Text:', !!text, 'Tools:', toolCalls?.length || 0);

        // Add tool calls with their results
        if (toolCalls && toolResults) {
          for (let i = 0; i < toolCalls.length; i++) {
            const toolCall: any = toolCalls[i];
            const toolResult: any = toolResults[i];

            console.log('🔧 Tool:', toolCall.toolName, 'Args:', JSON.stringify(toolCall.args));
            console.log('📤 Result:', JSON.stringify(toolResult?.result || toolResult));

            parts.push({
              type: `tool-${toolCall.toolName}`,
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              args: toolCall.args,
              output: toolResult?.result || toolResult,
            });
          }
        }

        // Add text content
        if (text) {
          parts.push({ type: 'text', text });
        }

        // Save this step as a separate message
        if (parts.length > 0) {
          await saveMessage(projectId, 'assistant', parts);
          console.log('✅ Step saved with', parts.length, 'parts');
        }
      } catch (error) {
        console.error('❌ Error in onStepFinish:', error);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
