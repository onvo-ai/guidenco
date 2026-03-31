import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, UIMessage, tool, stepCountIs } from "ai";
import { z } from "zod";
import {
  createOrUpdateDocument,
  getDocumentById,
  saveDocumentMessage,
  createPendingDocumentVersion,
  updateDocumentVersionContent,
  updateDocumentVersionStatus,
} from "@/lib/db/entities-service";
import { resizeImage } from "@/lib/image-processing";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { brandAssets, agentSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserCredits, deductCreditsForUsage } from "@/lib/billing";
import { getFileBuffer } from "@/lib/storage";
import { getOrCreateOrganizationId } from "@/lib/organization";
import { getAuthenticatedUser } from "@/lib/request-auth";

export const maxDuration = 60;

const tempDimensions = new Map<string, { width: number; height: number }>();
const tempPageCounts = new Map<string, number>();

const PAGE_BREAK = "\n<!-- PAGE_BREAK -->\n";
const PAGE_BREAK_LEGACY_GUIDENCO = "\n<!-- GUIDENCO_PAGE_BREAK -->\n";
const PAGE_BREAK_LEGACY_ARTISTE = "\n<!-- ARTISTE_PAGE_BREAK -->\n";

function splitPages(html: string): string[] {
  if (!html) return [""];
  const normalised = html
    .split(PAGE_BREAK_LEGACY_GUIDENCO)
    .join(PAGE_BREAK)
    .split(PAGE_BREAK_LEGACY_ARTISTE)
    .join(PAGE_BREAK);
  const parts = normalised.split(PAGE_BREAK);
  return parts.length > 0 ? parts : [""];
}

function joinPages(pages: string[]): string {
  return pages.join(PAGE_BREAK);
}

function clampPageIndex(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.min(Math.max(0, pageIndex), pageCount - 1);
}

function toDataUri(image: string, mimeType: string) {
  if (!image) return image;
  return image.startsWith("data:") ? image : `data:${mimeType};base64,${image}`;
}

async function getUserTeamAndAgentSettings(userId: string) {
  const organizationId = await getOrCreateOrganizationId(userId);
  const agentData = await db
    .select()
    .from(agentSettings)
    .where(eq(agentSettings.organizationId, organizationId))
    .limit(1);
  return {
    organizationId,
    designGuidelines: agentData[0]?.designGuidelines || "",
  };
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("documentId");
  const parentVersionId = searchParams.get("parentVersionId") ?? undefined;

  if (!documentId) return new Response("Document ID required", { status: 400 });

  const currentUser = await getAuthenticatedUser(await headers());
  if (!currentUser) return new Response("Unauthorized", { status: 401 });

  const { organizationId, designGuidelines } =
    await getUserTeamAndAgentSettings(currentUser.id);

  const creditBalance = await getUserCredits(organizationId);
  if (creditBalance <= 0)
    return new Response("Insufficient credits", { status: 402 });

  const {
    messages,
    prompt: directPrompt,
    parentPromptChain,
  }: {
    messages: UIMessage[];
    prompt?: string;
    parentPromptChain?: string[];
  } = await req.json();

  const lastUserMessage = messages[messages.length - 1];
  const userPrompt =
    directPrompt ??
    (lastUserMessage?.parts?.find((p: any) => p.type === "text") as any)
      ?.text ??
    "";

  const modelId =
    (process.env.OPENROUTER_MODEL || "").trim() || "google/gemini-2.5-pro";

  // Resolve the version ID to associate messages with
  const currentDoc = await getDocumentById(documentId);
  let activeVersionId: string | undefined =
    parentVersionId ?? currentDoc?.versions[currentDoc.currentVersion]?.id;
  let latestVersionId: string | undefined = activeVersionId;
  let pendingVersionId: string | undefined;

  // If no version exists yet (new document), create a pending version so the user message has somewhere to live
  if (!activeVersionId) {
    const { versionId } = await createPendingDocumentVersion(documentId, {
      prompt: userPrompt,
      parentVersionId,
      model: modelId,
    });
    activeVersionId = versionId;
    latestVersionId = versionId;
    pendingVersionId = versionId;
  }

  if (lastUserMessage?.role === "user" && activeVersionId) {
    await saveDocumentMessage(
      activeVersionId,
      "user",
      lastUserMessage.parts || [],
    ).catch(() => {});
  }

  // Get parent version HTML for branching context
  let parentHtml: string | undefined;
  let parentGoogleFonts: string[] = [];
  if (parentVersionId) {
    const parentVer = currentDoc?.versions.find(
      (v) => v.id === parentVersionId,
    );
    if (parentVer) {
      parentHtml = parentVer.html;
      parentGoogleFonts = parentVer.googleFonts || [];
    }
  }

  const convertedMessages = await Promise.all(
    messages.map(async (msg: any) => {
      const content: any[] = [];
      for (const part of msg.parts || []) {
        if (part.type === "text") {
          content.push({ type: "text", text: part.text });
        } else if (part.type === "image") {
          const mimeType = part.mimeType || "image/png";
          if (mimeType === "image/svg+xml") {
            content.push({
              type: "text",
              text: part.fileUrl
                ? `[SVG reference provided. Use this asset URL if needed: ${part.fileUrl}]`
                : "[SVG reference provided in chat context.]",
            });
            if (typeof part.image === "string" && part.image.length > 0) {
              content.push({
                type: "text",
                text: `[SVG content preview]\n\n${part.image.slice(0, 4000)}`,
              });
            }
            continue;
          }
          let imageContent = toDataUri(part.image, mimeType);
          try {
            imageContent = await resizeImage(imageContent);
          } catch (e) {
            console.error("Failed to resize image:", e);
          }
          content.push({ type: "image", image: imageContent, mimeType });
          if (part.fileUrl) {
            content.push({
              type: "text",
              text: `[Image uploaded to Design Warehouse. Permanent URL: ${part.fileUrl} — use this URL in <img src="..."> tags when embedding this image in document.]`,
            });
          }
        }
      }
      return {
        role: msg.role,
        content: content.length > 0 ? content : [{ type: "text", text: "" }],
      };
    }),
  );

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const chainContext =
    parentPromptChain && parentPromptChain.length > 0
      ? `\n\nVERSION HISTORY CONTEXT:\nThis version branches from a prior generation. The prompts used to create previous versions in this branch (oldest first) were:\n${parentPromptChain.map((p, i) => `${i + 1}. "${p}"`).join("\n")}\n\nBuild upon this creative direction.`
      : "";

  const result = streamText({
    model: openrouter(modelId),
    messages: convertedMessages as any,
    stopWhen: stepCountIs(5),
    system: `You are an AI assistant that helps users create digital assets using HTML, Tailwind CSS, and FontAwesome icons.${chainContext}

${designGuidelines ? `TEAM DESIGN GUIDELINES:\n${designGuidelines}\n\nIMPORTANT: Follow these design guidelines closely. They represent your team's brand standards.` : ""}

You have access to tools to:
1. Create a document with specific dimensions and number of pages
2. Write HTML with Tailwind CSS classes, FontAwesome icons, and Google Fonts
3. Make surgical edits to existing HTML (editHTML)
4. Create/delete pages
5. View the current document state as a rendered image (getDocumentState)

When a user asks you to CREATE something:
1. First, create a document with appropriate dimensions using createDocument (ONLY call this once)
2. Then write HTML — if multiple pages, prefer writePagesHTML ONCE to write all pages
3. After writing HTML, ALWAYS call getDocumentState to verify the output
4. If the rendered image doesn't match requirements, call writeHTML again with corrections

When a user asks to UPDATE or MODIFY:
- DO NOT call createDocument again
- First, call getDocumentState to see the current HTML and rendered image
- For SMALL, TARGETED changes: use editHTML (find/replace specific parts)
- For LARGE changes or complete redesigns: use writeHTML
- After editing, call getDocumentState to verify

Guidelines:
- Use Tailwind CSS utility classes for all styling
- Use FontAwesome icons with <i class="fas fa-icon-name"></i>
- Create responsive, modern designs
- For writeHTML, write COMPLETE HTML from scratch (replaces previous version)
- For small updates, prefer editHTML over writeHTML
- You can search for images using the searchImage tool

ELEMENT EDIT REQUESTS:
- When a message starts with "[ELEMENT EDIT REQUEST]", use editHTML to make a SURGICAL find/replace

DESIGN WAREHOUSE:
- Use listAssets to discover available assets
- Use inspectAsset to view an asset's content
- To embed an asset, use its proxyUrl (/api/assets/image?id=...) in <img> tags

CRITICAL: ALWAYS provide a text response after using tools.`,
    tools: {
      createDocument: tool({
        description:
          "Create a new document container with specified width and height.",
        inputSchema: z.object({
          width: z.number().describe("Width of the document in pixels"),
          height: z.number().describe("Height of the document in pixels"),
          pageCount: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe("How many pages to create (default: 1)"),
        }),
        execute: async ({
          width,
          height,
          pageCount = 1,
        }: {
          width: number;
          height: number;
          pageCount?: number;
        }) => {
          tempDimensions.set(documentId, { width, height });
          tempPageCounts.set(documentId, pageCount);
          return {
            success: true,
            message: `Document created with dimensions ${width}x${height}`,
            width,
            height,
            pageCount,
          };
        },
      }),
      writeHTML: tool({
        description:
          "Write HTML with Tailwind CSS classes, FontAwesome icons, and optional Google Fonts. This REPLACES the current page with a new version.",
        inputSchema: z.object({
          html: z.string().describe("Complete HTML with Tailwind CSS classes."),
          googleFonts: z
            .array(z.string())
            .optional()
            .describe("Array of Google Font family names to load"),
          pageIndex: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("If provided, updates only this page (0-based index)"),
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
            let dimensions = tempDimensions.get(documentId);
            const requestedPageCount = tempPageCounts.get(documentId);
            let existingDocument = await getDocumentById(documentId);

            if (!dimensions) {
              if (existingDocument) {
                dimensions = {
                  width: existingDocument.width,
                  height: existingDocument.height,
                };
              } else {
                return {
                  success: false,
                  error:
                    "No document exists. Please create a document first using createDocument.",
                };
              }
            }

            const sourceHtml =
              parentHtml !== undefined
                ? parentHtml
                : existingDocument?.versions[existingDocument.currentVersion]
                    ?.html || "";
            const sourceFonts =
              parentGoogleFonts.length > 0
                ? parentGoogleFonts
                : existingDocument?.versions[existingDocument.currentVersion]
                    ?.googleFonts || [];

            let htmlToStore = html;
            if (typeof pageIndex === "number") {
              let pages = splitPages(sourceHtml);
              if (
                (!existingDocument || pages.length === 1) &&
                requestedPageCount &&
                requestedPageCount > 1
              ) {
                pages = Array.from({ length: requestedPageCount }, () => "");
              }
              const safeIndex = clampPageIndex(pageIndex, pages.length);
              pages[safeIndex] = html;
              htmlToStore = joinPages(pages);
            } else if (requestedPageCount && requestedPageCount > 1) {
              const pages = Array.from(
                { length: requestedPageCount },
                () => "",
              );
              pages[0] = html;
              htmlToStore = joinPages(pages);
            }

            const fontsToUse =
              googleFonts && googleFonts.length > 0 ? googleFonts : sourceFonts;
            tempDimensions.delete(documentId);
            tempPageCounts.delete(documentId);
            const storedPages = splitPages(htmlToStore);
            const resolvedPageIndex =
              typeof pageIndex === "number"
                ? clampPageIndex(pageIndex, storedPages.length)
                : 0;

            if (pendingVersionId) {
              // Update the pending version in-place with the real content
              await updateDocumentVersionContent(pendingVersionId, {
                html: htmlToStore,
                width: dimensions.width,
                height: dimensions.height,
                googleFonts: fontsToUse,
                title: existingDocument?.title ?? "Untitled Document",
                status: "done",
              });
              latestVersionId = pendingVersionId;
              pendingVersionId = undefined;
              return {
                success: true,
                message: "HTML updated successfully (Version 1)",
                version: 0,
                totalVersions: 1,
                width: dimensions.width,
                height: dimensions.height,
                pageCount: storedPages.length,
                pageIndex: resolvedPageIndex,
              };
            }

            const {
              currentVersion,
              totalVersions,
              newVersionId: wvId,
            } = await createOrUpdateDocument(
              documentId,
              existingDocument?.title ?? "Untitled Document",
              dimensions.width,
              dimensions.height,
              htmlToStore,
              fontsToUse,
              userPrompt,
              parentVersionId,
              modelId,
            );
            if (wvId) latestVersionId = wvId;

            let message = `HTML updated successfully (Version ${currentVersion + 1})`;
            if (typeof pageIndex === "number" && storedPages.length > 1) {
              message = `HTML updated successfully for page ${resolvedPageIndex + 1} of ${storedPages.length} (Version ${currentVersion + 1})`;
            }
            return {
              success: true,
              message,
              version: currentVersion,
              totalVersions,
              width: dimensions.width,
              height: dimensions.height,
              pageCount: storedPages.length,
              pageIndex: resolvedPageIndex,
            };
          } catch (error: any) {
            console.error("Error in writeHTML:", error);
            return {
              success: false,
              error: `Failed to write HTML: ${error.message}`,
            };
          }
        },
      }),
      editHTML: tool({
        description:
          "Make surgical edits to existing HTML by finding and replacing specific parts.",
        inputSchema: z.object({
          findString: z
            .string()
            .describe("The exact HTML string to find and replace."),
          replaceString: z
            .string()
            .describe("The new HTML string to replace it with."),
          pageIndex: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("If provided, edits only this page (0-based index)."),
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
            const document = await getDocumentById(documentId);
            if (!document)
              return { success: false, error: "No document exists." };

            const sourceHtml =
              parentHtml !== undefined
                ? parentHtml
                : document.versions[document.currentVersion]?.html || "";
            const sourceFonts =
              parentGoogleFonts.length > 0
                ? parentGoogleFonts
                : document.versions[document.currentVersion]?.googleFonts || [];
            const pages = splitPages(sourceHtml);
            const targetPageIndex = clampPageIndex(
              typeof pageIndex === "number" ? pageIndex : 0,
              pages.length,
            );
            const pageHTML = pages[targetPageIndex] || "";

            if (!pageHTML.includes(findString))
              return {
                success: false,
                error: `Could not find the specified string in page ${targetPageIndex + 1}.`,
              };
            const occurrences = pageHTML.split(findString).length - 1;
            if (occurrences > 1)
              return {
                success: false,
                error: `The findString appears ${occurrences} times. Please provide a more specific string.`,
              };

            pages[targetPageIndex] = pageHTML.replace(
              findString,
              replaceString,
            );
            const htmlToStore = joinPages(pages);
            const {
              currentVersion,
              totalVersions,
              newVersionId: evId,
            } = await createOrUpdateDocument(
              documentId,
              document.title,
              document.width,
              document.height,
              htmlToStore,
              sourceFonts,
              userPrompt,
              parentVersionId,
              modelId,
            );
            if (evId) latestVersionId = evId;
            return {
              success: true,
              message: `HTML edited successfully (Version ${currentVersion + 1})`,
              version: currentVersion,
              totalVersions,
              pageCount: pages.length,
              pageIndex: targetPageIndex,
            };
          } catch (error: any) {
            return {
              success: false,
              error: `Failed to edit HTML: ${error.message}`,
            };
          }
        },
      }),
      writePagesHTML: tool({
        description:
          "Write ALL pages of a multi-page document in a SINGLE version.",
        inputSchema: z.object({
          pages: z
            .array(z.string())
            .min(1)
            .max(50)
            .describe("Array of page HTML strings, in order."),
          googleFonts: z
            .array(z.string())
            .optional()
            .describe("Array of Google Font family names to load"),
        }),
        execute: async ({
          pages,
          googleFonts,
        }: {
          pages: string[];
          googleFonts?: string[];
        }) => {
          try {
            let dimensions = tempDimensions.get(documentId);
            const requestedPageCount = tempPageCounts.get(documentId);
            let existingDocument = await getDocumentById(documentId);
            if (!dimensions) {
              if (existingDocument) {
                dimensions = {
                  width: existingDocument.width,
                  height: existingDocument.height,
                };
              } else
                return {
                  success: false,
                  error:
                    "No document exists. Please create one first using createDocument.",
                };
            }
            const desiredCount =
              requestedPageCount && requestedPageCount > 0
                ? requestedPageCount
                : pages.length;
            const normalizedPages = Array.from(
              { length: desiredCount },
              (_, idx) => pages[idx] ?? "",
            );
            const htmlToStore = joinPages(normalizedPages);
            tempDimensions.delete(documentId);
            tempPageCounts.delete(documentId);

            if (pendingVersionId) {
              await updateDocumentVersionContent(pendingVersionId, {
                html: htmlToStore,
                width: dimensions.width,
                height: dimensions.height,
                googleFonts: googleFonts || [],
                title: existingDocument?.title ?? "Untitled Document",
                status: "done",
              });
              latestVersionId = pendingVersionId;
              pendingVersionId = undefined;
              return {
                success: true,
                message: "HTML updated successfully (Version 1)",
                version: 0,
                totalVersions: 1,
                pageCount: normalizedPages.length,
              };
            }

            const {
              currentVersion,
              totalVersions,
              newVersionId: wpId,
            } = await createOrUpdateDocument(
              documentId,
              existingDocument?.title ?? "Untitled Document",
              dimensions.width,
              dimensions.height,
              htmlToStore,
              googleFonts || [],
              userPrompt,
              parentVersionId,
              modelId,
            );
            if (wpId) latestVersionId = wpId;
            return {
              success: true,
              message: `HTML updated successfully (Version ${currentVersion + 1})`,
              version: currentVersion,
              totalVersions,
              pageCount: normalizedPages.length,
            };
          } catch (error: any) {
            return {
              success: false,
              error: `Failed to write pages HTML: ${error.message}`,
            };
          }
        },
      }),
      createPage: tool({
        description: "Create a new blank page in the current document.",
        inputSchema: z.object({
          afterPageIndex: z
            .number()
            .int()
            .min(-1)
            .optional()
            .describe(
              "Insert after this 0-based index. -1 = beginning. Default = append.",
            ),
        }),
        execute: async ({ afterPageIndex }: { afterPageIndex?: number }) => {
          try {
            const document = await getDocumentById(documentId);
            if (!document)
              return { success: false, error: "No document exists." };
            const sourceHtml =
              parentHtml !== undefined
                ? parentHtml
                : document.versions[document.currentVersion]?.html || "";
            const sourceFonts =
              parentGoogleFonts.length > 0
                ? parentGoogleFonts
                : document.versions[document.currentVersion]?.googleFonts || [];
            const pages = splitPages(sourceHtml);
            const insertAfter =
              typeof afterPageIndex === "number"
                ? afterPageIndex
                : pages.length - 1;
            const insertAt = Math.min(
              Math.max(insertAfter + 1, 0),
              pages.length,
            );
            const nextPages = [
              ...pages.slice(0, insertAt),
              "",
              ...pages.slice(insertAt),
            ];
            const {
              currentVersion,
              totalVersions,
              newVersionId: cpId,
            } = await createOrUpdateDocument(
              documentId,
              document.title,
              document.width,
              document.height,
              joinPages(nextPages),
              sourceFonts,
              userPrompt,
              parentVersionId,
              modelId,
            );
            if (cpId) latestVersionId = cpId;
            return {
              success: true,
              message: `Page created (Version ${currentVersion + 1})`,
              pageCount: nextPages.length,
              pageIndex: insertAt,
              version: currentVersion,
              totalVersions,
            };
          } catch (error: any) {
            return {
              success: false,
              error: `Failed to create page: ${error.message}`,
            };
          }
        },
      }),
      deletePage: tool({
        description:
          "Delete a page from the current document by 0-based pageIndex.",
        inputSchema: z.object({
          pageIndex: z
            .number()
            .int()
            .min(0)
            .describe("0-based index of the page to delete."),
        }),
        execute: async ({ pageIndex }: { pageIndex: number }) => {
          try {
            const document = await getDocumentById(documentId);
            if (!document)
              return { success: false, error: "No document exists." };
            const sourceHtml =
              parentHtml !== undefined
                ? parentHtml
                : document.versions[document.currentVersion]?.html || "";
            const sourceFonts =
              parentGoogleFonts.length > 0
                ? parentGoogleFonts
                : document.versions[document.currentVersion]?.googleFonts || [];
            const pages = splitPages(sourceHtml);
            if (pages.length <= 1)
              return {
                success: false,
                error: "Cannot delete the last remaining page.",
              };
            if (pageIndex < 0 || pageIndex >= pages.length)
              return { success: false, error: `Invalid pageIndex.` };
            const nextPages = pages.filter((_, idx) => idx !== pageIndex);
            const {
              currentVersion,
              totalVersions,
              newVersionId: dpId,
            } = await createOrUpdateDocument(
              documentId,
              document.title,
              document.width,
              document.height,
              joinPages(nextPages),
              sourceFonts,
              userPrompt,
              parentVersionId,
              modelId,
            );
            if (dpId) latestVersionId = dpId;
            return {
              success: true,
              message: `Page deleted (Version ${currentVersion + 1})`,
              pageCount: nextPages.length,
              deletedPageIndex: pageIndex,
              version: currentVersion,
              totalVersions,
            };
          } catch (error: any) {
            return {
              success: false,
              error: `Failed to delete page: ${error.message}`,
            };
          }
        },
      }),
      getDocumentState: tool({
        description:
          "Get the current rendered state of the document as an image. Use this to visually inspect what has been created so far.",
        inputSchema: z.object({
          pageIndex: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe(
              "If provided, returns state for this specific page (0-based).",
            ),
        }),
        execute: async ({ pageIndex }: { pageIndex?: number }) => {
          try {
            const document = await getDocumentById(documentId);
            if (!document)
              return { success: false, error: "No document exists." };
            const currentHTML =
              document.versions[document.currentVersion]?.html || "";
            const currentFonts =
              document.versions[document.currentVersion]?.googleFonts || [];
            const pages = splitPages(currentHTML);
            const resolvedPageIndex = clampPageIndex(
              typeof pageIndex === "number" ? pageIndex : 0,
              pages.length,
            );
            const pageHTML = pages[resolvedPageIndex] || "";
            let imageData = null;
            try {
              const renderResponse = await fetch(
                `${process.env.NEXT_PUBLIC_APP_URL}/api/render`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    template: pageHTML,
                    width: document.width,
                    height: document.height,
                    format: "base64",
                    googleFonts: currentFonts,
                  }),
                },
              );
              if (renderResponse.ok) {
                const renderData = await renderResponse.json();
                imageData = renderData.image;
                if (imageData) {
                  try {
                    imageData = await resizeImage(imageData);
                  } catch (e) {
                    console.error("Failed to resize image:", e);
                  }
                }
              }
            } catch (renderError) {
              console.error("Error rendering image:", renderError);
            }
            return {
              success: true,
              width: document.width,
              height: document.height,
              image: imageData,
              version: document.currentVersion,
              totalVersions: document.versions.length,
              pageCount: pages.length,
              pageIndex: resolvedPageIndex,
            };
          } catch (error: any) {
            return {
              success: false,
              error: `Error getting document state: ${error.message}`,
            };
          }
        },
      }),
      searchImage: tool({
        description: "Search for images on Unsplash and get image URLs.",
        inputSchema: z.object({
          query: z.string().describe("Search term for the image"),
          count: z
            .number()
            .optional()
            .describe("Number of images to return (default: 1, max: 5)"),
        }),
        execute: async ({
          query,
          count = 1,
        }: {
          query: string;
          count?: number;
        }) => {
          try {
            const perPage = Math.min(count, 5);
            const response = await fetch(
              `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`,
              {
                headers: {
                  Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
                },
              },
            );
            if (!response.ok)
              return { success: false, error: "Failed to search images" };
            const data = await response.json();
            return {
              success: true,
              query,
              images: data.results.map((img: any) => ({
                url: img.urls.regular,
                thumbnail: img.urls.small,
                width: img.width,
                height: img.height,
                description: img.description || img.alt_description,
                photographer: img.user.name,
              })),
            };
          } catch {
            return { success: false, error: "Error searching for images" };
          }
        },
      }),
      listAssets: tool({
        description: "List all assets in the team's Design Warehouse.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const teamAssets = await db
              .select()
              .from(brandAssets)
              .where(eq(brandAssets.organizationId, organizationId));
            return {
              success: true,
              assets: teamAssets.map((a) => ({
                id: a.id,
                title: a.title,
                description: a.description,
                fileUrl: a.fileUrl,
                mimeType: a.mimeType,
              })),
            };
          } catch {
            return {
              success: false,
              error: "Failed to list assets",
              assets: [],
            };
          }
        },
      }),
      inspectAsset: tool({
        description:
          "Inspect a specific asset from the Design Warehouse. Returns a rendered image.",
        inputSchema: z.object({
          assetId: z.string().describe("The ID of the asset to inspect"),
        }),
        execute: async ({ assetId }: { assetId: string }) => {
          try {
            const asset = await db
              .select()
              .from(brandAssets)
              .where(eq(brandAssets.id, assetId))
              .limit(1);
            if (!asset.length)
              return { success: false, error: "Asset not found" };
            const a = asset[0];
            const buffer = await getFileBuffer(a.fileKey);
            if (a.mimeType === "application/pdf") {
              const renderResponse = await fetch(
                `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/render`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    pdfBuffer: buffer.toString("base64"),
                    format: "base64",
                    width: 800,
                    height: 600,
                  }),
                },
              );
              if (renderResponse.ok) {
                const data = await renderResponse.json();
                return {
                  success: true,
                  title: a.title,
                  description: a.description,
                  mimeType: a.mimeType,
                  fileUrl: a.fileUrl,
                  proxyUrl: `/api/assets/image?id=${a.id}`,
                  image: data.image,
                };
              }
              return {
                success: true,
                title: a.title,
                description: a.description,
                mimeType: a.mimeType,
                fileUrl: a.fileUrl,
                proxyUrl: `/api/assets/image?id=${a.id}`,
              };
            }
            const base64 = buffer.toString("base64");
            return {
              success: true,
              title: a.title,
              description: a.description,
              mimeType: a.mimeType,
              fileUrl: a.fileUrl,
              proxyUrl: `/api/assets/image?id=${a.id}`,
              image: `data:${a.mimeType};base64,${base64}`,
            };
          } catch {
            return { success: false, error: "Failed to inspect asset" };
          }
        },
      }),
    },
    onFinish: async () => {
      // If generation ended without ever writing HTML, mark the pending version as error
      if (pendingVersionId) {
        await updateDocumentVersionStatus(pendingVersionId, "error").catch(
          () => {},
        );
      }
    },
    onStepFinish: async ({ text, toolCalls, toolResults, usage }) => {
      await deductCreditsForUsage(organizationId, usage).catch(() => {});
      try {
        const parts: any[] = [];
        if (toolCalls && toolResults) {
          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i] as any;
            const tr = toolResults[i] as any;
            parts.push({
              type: `tool-${tc.toolName}`,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: tc.args,
              output: tr?.result || tr,
            });
          }
        }
        if (text) parts.push({ type: "text", text });
        if (parts.length > 0 && latestVersionId)
          await saveDocumentMessage(latestVersionId, "assistant", parts);
      } catch (e) {
        console.error("Error in onStepFinish:", e);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
