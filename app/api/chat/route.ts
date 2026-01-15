import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, convertToModelMessages, UIMessage, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { createOrUpdateArtwork, getProjectArtwork, getProjectMessages, saveMessage } from '@/lib/db/projects-service';

export const maxDuration = 30;

// Temporary state for dimensions during creation
const tempDimensions = new Map<string, { width: number; height: number }>();

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

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

  // Manually convert messages to handle images properly
  const convertedMessages = messages.map((msg: any) => {
    const content: any[] = [];

    for (const part of msg.parts || []) {
      if (part.type === 'text') {
        content.push({ type: 'text', text: part.text });
      } else if (part.type === 'image') {
        content.push({
          type: 'image',
          image: part.image,
          mimeType: part.mimeType || 'image/png'
        });
      }
    }

    return {
      role: msg.role,
      content: content.length > 0 ? content : [{ type: 'text', text: '' }]
    };
  });

  const result = streamText({
    model: openrouter('google/gemini-2.5-pro'),
    messages: convertedMessages as any,
    stopWhen: stepCountIs(5),
    system: `You are an AI assistant that helps users create digital assets using HTML, Tailwind CSS, and FontAwesome icons.

You have access to tools to:
1. Create an artwork with specific dimensions (container size)
2. Write HTML with Tailwind CSS classes, FontAwesome icons, and Google Fonts
3. View the current artwork state - this returns BOTH the HTML code AND a rendered image of what it looks like

When a user asks you to create something:
1. First, create an artwork with appropriate dimensions using the createArtwork tool (ONLY call this once per artwork)
2. Then, write HTML using the writeHTML tool with:
   - Tailwind CSS for styling
   - FontAwesome icons (e.g., <i class="fas fa-heart"></i>)
   - Google Fonts by specifying the googleFonts parameter (e.g., ["Roboto", "Playfair Display"])
   - Use font-family CSS or Tailwind's arbitrary values to apply fonts: style="font-family: 'Roboto'" or class="font-['Roboto']"
3. After writing HTML, ALWAYS call getArtworkState to verify the output matches the user's requirements
   - The getArtworkState tool will show you an IMAGE of the rendered artwork
   - LOOK AT THE IMAGE carefully to verify it matches what the user requested
   - The image field contains a base64-encoded PNG showing exactly what the artwork looks like
4. If the rendered image doesn't match requirements, call writeHTML again with corrections

When a user asks you to UPDATE or MODIFY existing artwork:
- DO NOT call createArtwork again - this will reset the version history
- First, call getArtworkState to see the current HTML AND the rendered image
- Then call writeHTML with the updated HTML
- After writing, call getArtworkState again to verify the changes
- Each writeHTML call creates a new version automatically

Guidelines:
- Use Tailwind CSS utility classes for all styling (e.g., bg-blue-500, text-white, rounded-lg, flex, etc.)
- Use FontAwesome icons with <i class="fas fa-icon-name"></i> or <i class="fab fa-icon-name"></i>
- Create responsive, modern designs with proper spacing and colors
- The HTML will be rendered in a container, so use relative units and flexbox/grid for layouts
- You can use any Tailwind classes and FontAwesome icons
- IMPORTANT: Each time you call writeHTML, write the COMPLETE HTML from scratch. It will replace the previous version, not append to it.
- When updating designs, rewrite the entire HTML with all the improvements, don't just add fragments.
- You can search for images using the searchImage tool and use the returned URLs in <img> tags
- Choose dimensions that match the desired output size (e.g., 800x600 for a web banner, 1080x1080 for social media)

Always use the tools to create the artwork. The user will see the visual output in real-time.`,
    tools: {
      createArtwork: tool({
        description: 'Create a new artwork container with specified width and height.',
        inputSchema: z.object({
          width: z.number().describe('Width of the artwork in pixels'),
          height: z.number().describe('Height of the artwork in pixels'),
        }),
        execute: async ({ width, height }: { width: number; height: number }) => {
          // Store dimensions temporarily for writeHTML
          tempDimensions.set(projectId, { width, height });
          return {
            success: true,
            message: `Artwork created with dimensions ${width}x${height}`,
            width,
            height,
          };
        },
      }),
      writeHTML: tool({
        description: 'Write Handlebars template with Tailwind CSS classes, FontAwesome icons, and optional Google Fonts. This will REPLACE the current template with a new version. Available Handlebars helpers: {{#each (range 1 10)}} for loops, {{#if (odd @index)}} or {{#if (even @index)}} for conditionals, {{variable}} for data.',
        inputSchema: z.object({
          html: z.string().describe('Complete Handlebars template with Tailwind CSS classes. Use plain HTML for static content. Available helpers: (range start end) creates array from start to end, (odd number) checks if odd, (even number) checks if even. Example: {{#each (range 1 5)}}<div>{{this}}</div>{{/each}}. Use FontAwesome icons with <i class="fas fa-icon-name"></i>. For Google Fonts, use font-family in style or Tailwind classes.'),
          googleFonts: z.array(z.string()).optional().describe('Array of Google Font family names to load (e.g., ["Roboto", "Open Sans", "Playfair Display"]). These will be automatically loaded from Google Fonts.'),
        }),
        execute: async ({ html, googleFonts }: { html: string; googleFonts?: string[] }) => {
          try {
            // Get dimensions from temp storage or existing artwork
            let dimensions = tempDimensions.get(projectId);

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

            // Save to database
            const { currentVersion, totalVersions } = await createOrUpdateArtwork(
              projectId,
              dimensions.width,
              dimensions.height,
              html,
              googleFonts || []
            );

            // Clear temp dimensions
            tempDimensions.delete(projectId);

            return {
              success: true,
              message: `HTML updated successfully (Version ${currentVersion + 1})`,
              html,
              version: currentVersion,
              totalVersions,
              width: dimensions.width,
              height: dimensions.height,
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
      getArtworkState: tool({
        description: 'Get the current state of the artwork including dimensions, HTML code, and a rendered image. Use this to see what has been created so far and make improvements.',
        inputSchema: z.object({}),
        execute: async () => {
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

            // Render the template to an image
            let imageData = null;
            try {
              const renderResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  template: currentHTML,
                  width: artwork.width,
                  height: artwork.height,
                  format: 'base64',
                  googleFonts: currentFonts,
                }),
              });

              if (renderResponse.ok) {
                const renderData = await renderResponse.json();
                imageData = renderData.image;
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
              html: currentHTML,
              image: imageData,
              version: artwork.currentVersion,
              totalVersions: artwork.versions.length,
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
