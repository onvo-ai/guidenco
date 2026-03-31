import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, UIMessage, tool, stepCountIs } from "ai";
import { z } from "zod";
import {
  saveAssetMessage,
  upsertAsset,
  getAssetById,
  getAssetVersionById,
  updateAssetVersionUsage,
} from "@/lib/db/entities-service";
import { headers } from "next/headers";
import {
  getUserCredits,
  deductCreditsForUsage,
  TOKENS_PER_CREDIT,
} from "@/lib/billing";
import { getOrCreateOrganizationId } from "@/lib/organization";
import { getAuthenticatedUser } from "@/lib/request-auth";

export const maxDuration = 60;
const DEFAULT_SVG_MODEL = "google/gemini-2.5-pro";
const ALLOWED_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite-preview",
  "google/gemini-3.1-pro-preview",
];

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get("assetId");
    const parentVersionId = searchParams.get("parentVersionId") ?? undefined;

    if (!assetId) return new Response("Asset ID required", { status: 400 });

    const currentUser = await getAuthenticatedUser(await headers());
    if (!currentUser) return new Response("Unauthorized", { status: 401 });

    const organizationId = await getOrCreateOrganizationId(currentUser.id);

    // Credit check — reject before touching the LLM
    const creditBalance = await getUserCredits(organizationId);
    if (creditBalance <= 0) {
      return new Response("Insufficient credits", { status: 402 });
    }

    const {
      messages,
      prompt: directPrompt,
      parentPromptChain,
      model: requestModel,
    }: {
      messages: UIMessage[];
      prompt?: string;
      parentPromptChain?: string[];
      model?: string;
    } = await req.json();

    const lastUserMessage = messages[messages.length - 1];
    // Resolve model: prefer request-provided model (if in allowed list), then env vars, then default
    const requestedModel =
      requestModel && ALLOWED_MODELS.includes(requestModel)
        ? requestModel
        : null;
    const configuredSvgModel = (process.env.SVG_MODEL || "").trim();
    const configuredDefaultModel = (process.env.OPENROUTER_MODEL || "").trim();
    const selectedConfiguredModel =
      configuredSvgModel || configuredDefaultModel;
    const envModel =
      selectedConfiguredModel && !selectedConfiguredModel.includes("preview")
        ? selectedConfiguredModel
        : DEFAULT_SVG_MODEL;
    const modelId = requestedModel ?? envModel;

    if (lastUserMessage?.role === "user") {
      await saveAssetMessage(
        assetId,
        "user",
        lastUserMessage.parts || [],
        modelId,
      );
    }

    const userPrompt =
      directPrompt ??
      (lastUserMessage?.parts?.find((p: any) => p.type === "text") as any)
        ?.text ??
      "";

    const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
    if (!apiKey) {
      return new Response("OPENROUTER_API_KEY is not configured.", {
        status: 500,
      });
    }

    const openrouter = createOpenRouter({ apiKey });

    // Accumulate token/credit usage across all steps
    let totalTokens = 0;
    let totalCredits = 0;
    let savedVersionId: string | undefined;

    // If branching from a parent version, get that version's SVG as context
    let parentSvgContent: string | undefined;
    if (parentVersionId) {
      const parentVersion = await getAssetVersionById(parentVersionId);
      parentSvgContent = parentVersion?.svgContent;
    }

    const currentAsset = await getAssetById(assetId);

    const convertedMessages = messages.map((msg: any) => {
      const contentParts: any[] = (msg.parts || []).flatMap((p: any) => {
        if (p.type === "text") return [{ type: "text" as const, text: p.text }];
        if (p.type === "file" && p.data && p.mimeType) {
          // Strip data URL prefix to get raw base64
          const base64 = p.data.includes(",") ? p.data.split(",")[1] : p.data;
          return [
            { type: "image" as const, image: base64, mimeType: p.mimeType },
          ];
        }
        return [];
      });
      return {
        role: msg.role,
        content:
          contentParts.length > 0
            ? contentParts
            : [{ type: "text" as const, text: "" }],
      };
    });

    const chainContext =
      parentPromptChain && parentPromptChain.length > 0
        ? `\n\nVERSION HISTORY CONTEXT:\nThis SVG branches from a prior version. The prompts used to create previous versions in this branch (oldest first):\n${parentPromptChain.map((p, i) => `${i + 1}. "${p}"`).join("\n")}\n\nUse this to understand the creative direction and evolve it accordingly.`
        : "";

    const result = streamText({
      model: openrouter(modelId),
      messages: convertedMessages as any,
      stopWhen: currentAsset ? stepCountIs(3) : stepCountIs(1),
      ...(currentAsset
        ? {}
        : {
            activeTools: ["saveSVG"],
            toolChoice: { type: "tool" as const, toolName: "saveSVG" as const },
          }),
      system: `You are an expert SVG designer. Your job is to create high-quality, standalone SVG assets for the user.${chainContext}

Guidelines:
- Always output a complete, valid, self-contained SVG (starting with <svg ...> and ending with </svg>)
- Use viewBox for scalability (e.g., viewBox="0 0 200 200")
- Include explicit width and height attributes appropriate for the asset
- Use clean, semantic SVG with paths, shapes, gradients, and text as needed
- Create visually polished, professional-looking assets
- Logos, icons, illustrations, badges, decorative elements — anything vector
- Use gradients, masks, filters, and other SVG features to create rich visuals
- Do NOT include any HTML wrapper, just the raw SVG markup

When a user asks you to create or modify an SVG asset:
1. Use the saveSVG tool to save the SVG content — this updates the preview immediately
2. Always call saveSVG with the complete SVG code
3. Provide a brief description of what you created after saving

If the user asks to modify or improve the asset, use getSVG to see the current SVG first, then save an updated version.

CRITICAL: Always end with a text explanation of what you created/changed.`,
      tools: {
        saveSVG: tool({
          description:
            "Save the generated SVG asset. This immediately updates the preview.",
          inputSchema: z.object({
            svgContent: z
              .string()
              .describe(
                "The complete SVG markup starting with <svg and ending with </svg>",
              ),
            title: z
              .string()
              .optional()
              .describe(
                'Short title for the asset (e.g., "Company Logo", "Star Icon")',
              ),
          }),
          execute: async ({
            svgContent,
            title,
          }: {
            svgContent: string;
            title?: string;
          }) => {
            try {
              const result = await upsertAsset(assetId, {
                svgContent,
                title,
                createVersion: true,
                prompt: userPrompt,
                parentVersionId,
                model: modelId,
              });
              savedVersionId = (result as any).newVersionId;
              return { success: true, message: "SVG saved successfully" };
            } catch (error: any) {
              console.error("Error saving SVG asset:", error);
              return { success: false, error: error.message };
            }
          },
        }),
        getSVG: tool({
          description:
            "Get the current SVG asset content so you can modify or improve it.",
          inputSchema: z.object({}),
          execute: async () => {
            const svgContent =
              parentSvgContent ??
              currentAsset?.versions?.[currentAsset.currentVersion ?? 0]
                ?.svgContent;
            if (!svgContent)
              return { success: false, error: "No SVG asset yet" };

            const image = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`;

            return {
              success: true,
              title: "Current SVG Asset",
              image,
              mimeType: "image/svg+xml",
              message: "Inspecting current asset...",
            };
          },
        }),
      },
      onStepFinish: async ({
        text,
        toolCalls,
        toolResults,
        finishReason,
        usage,
      }) => {
        const u = usage as any;
        const stepTokens =
          (u?.inputTokens ?? u?.promptTokens ?? 0) +
          (u?.outputTokens ?? u?.completionTokens ?? 0);
        const stepCredits = Math.max(
          1,
          Math.ceil(stepTokens / TOKENS_PER_CREDIT),
        );
        totalTokens += stepTokens;
        totalCredits += stepCredits;
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
          if (parts.length > 0)
            await saveAssetMessage(assetId, "assistant", parts, modelId);
        } catch (e) {
          console.error("Error saving asset message:", e);
        }
      },
      onFinish: async () => {
        if (savedVersionId && totalTokens > 0) {
          await updateAssetVersionUsage(
            savedVersionId,
            totalTokens,
            totalCredits,
          ).catch(() => {});
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Asset chat route failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown asset chat error";
    return new Response(`Asset chat failed: ${message}`, { status: 500 });
  }
}
