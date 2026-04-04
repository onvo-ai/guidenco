import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, UIMessage, stepCountIs } from 'ai';
import { headers } from 'next/headers';
import { getUserCredits, deductCreditsForUsage, TOKENS_PER_CREDIT } from '@/lib/billing';
import { getOrCreateOrganizationId } from '@/lib/organization';
import { getAuthenticatedUser } from '@/lib/request-auth';
import { convertMessages, MessageConversionMode } from './message-converter';

export interface VersionTracker {
  currentVersionId: string;
  contentSaved: boolean;
  totalTokens: number;
  totalCredits: number;
}

export interface PendingVersionOpts {
  prompt?: string;
  parentVersionId?: string;
  model?: string;
}

interface EntitySnapshot {
  currentVersion: number;
  versions: Array<{ id: string; model?: string }>;
}

export interface SystemPromptContext {
  entityId: string;
  organizationId: string;
  chainContext: string;
  orgData: Record<string, unknown>;
  entity: EntitySnapshot | null;
}

export interface ToolContext {
  entityId: string;
  organizationId: string;
  tracker: VersionTracker;
  userPrompt: string;
  parentVersionId: string | undefined;
  modelId: string;
  entity: EntitySnapshot | null;
  orgData: Record<string, unknown>;
}

export interface EntityChatConfig {
  /** URL searchParam name for the entity ID, e.g. 'assetId' */
  entityIdParam: string;
  defaultModel: string;
  allowedModels: string[];
  /** Optional env var key(s) to check for the model, e.g. 'SVG_MODEL' */
  envModelKeys?: string[];
  maxSteps: number | ((entity: EntitySnapshot | null) => number);
  /** Extra streamText options per request (e.g. activeTools / toolChoice for new assets) */
  getStreamOverrides?: (entity: EntitySnapshot | null) => Record<string, unknown>;
  messageConversionMode: MessageConversionMode;
  messageConversionLabel?: string;
  /** Optional per-request org data fetch (e.g. design guidelines) */
  fetchOrgData?: (organizationId: string) => Promise<Record<string, unknown>>;
  loadEntity: (entityId: string) => Promise<EntitySnapshot | null>;
  createPendingVersion: (entityId: string, opts: PendingVersionOpts) => Promise<string>;
  markVersionError: (versionId: string) => Promise<void>;
  saveMessage: (versionId: string, role: 'user' | 'assistant', parts: any[]) => Promise<void>;
  updateVersionUsage: (versionId: string, tokens: number, credits: number) => Promise<void>;
  buildSystemPrompt: (ctx: SystemPromptContext) => string;
  buildTools: (ctx: ToolContext) => Record<string, any>;
}

export function createEntityChatHandler(config: EntityChatConfig) {
  return async function POST(req: Request): Promise<Response> {
    try {
      const { searchParams } = new URL(req.url);
      const entityId = searchParams.get(config.entityIdParam);
      const parentVersionId = searchParams.get('parentVersionId') ?? undefined;

      if (!entityId) return new Response(`${config.entityIdParam} is required`, { status: 400 });

      const currentUser = await getAuthenticatedUser(await headers());
      if (!currentUser) return new Response('Unauthorized', { status: 401 });

      const organizationId = await getOrCreateOrganizationId(currentUser.id);

      const creditBalance = await getUserCredits(organizationId);
      if (creditBalance <= 0) return new Response('Insufficient credits', { status: 402 });

      const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
      if (!apiKey) return new Response('OPENROUTER_API_KEY is not configured', { status: 500 });

      const { messages, prompt: directPrompt, parentPromptChain, model: requestModel }: {
        messages: UIMessage[];
        prompt?: string;
        parentPromptChain?: string[];
        model?: string;
      } = await req.json();

      const lastUserMessage = messages[messages.length - 1];
      const userPrompt = directPrompt ?? (lastUserMessage?.parts?.find((p: any) => p.type === 'text') as any)?.text ?? '';

      // Fetch entity + org data in parallel
      const [entity, orgData] = await Promise.all([
        config.loadEntity(entityId),
        config.fetchOrgData ? config.fetchOrgData(organizationId) : Promise.resolve({} as Record<string, unknown>),
      ]);

      // 4-tier model resolution: request → inherited version → env → default
      const requestedModel = requestModel && config.allowedModels.includes(requestModel) ? requestModel : undefined;
      const parentVer = parentVersionId ? entity?.versions.find(v => v.id === parentVersionId) : undefined;
      const currentVer = entity?.versions[entity.currentVersion];
      const inheritedModel = parentVer?.model ?? currentVer?.model;
      const safeInheritedModel = inheritedModel && config.allowedModels.includes(inheritedModel) ? inheritedModel : undefined;
      const envCandidate = (config.envModelKeys ?? [])
        .map(k => (process.env[k] || '').trim())
        .find(v => v && config.allowedModels.includes(v));
      const safeEnvModel = envCandidate ?? ((process.env.OPENROUTER_MODEL || '').trim() && config.allowedModels.includes((process.env.OPENROUTER_MODEL || '').trim()) ? (process.env.OPENROUTER_MODEL || '').trim() : undefined);
      const modelId = requestedModel ?? safeInheritedModel ?? safeEnvModel ?? config.defaultModel;

      // Create pending version — all entities use the same pattern
      const currentVersionId = await config.createPendingVersion(entityId, {
        prompt: userPrompt,
        parentVersionId,
        model: modelId,
      });

      const tracker: VersionTracker = {
        currentVersionId,
        contentSaved: false,
        totalTokens: 0,
        totalCredits: 0,
      };

      // Save user message against the pending version
      if (lastUserMessage?.role === 'user') {
        await config.saveMessage(currentVersionId, 'user', lastUserMessage.parts || []).catch(() => {});
      }

      const convertedMessages = await convertMessages(messages, config.messageConversionMode, config.messageConversionLabel);

      const chainContext = parentPromptChain && parentPromptChain.length > 0
        ? `\n\nVERSION HISTORY CONTEXT:\nThis version branches from a prior generation. The prompts used to create previous versions in this branch (oldest first):\n${parentPromptChain.map((p, i) => `${i + 1}. "${p}"`).join('\n')}\n\nBuild upon this creative direction.`
        : '';

      const openrouter = createOpenRouter({ apiKey });

      const systemPromptCtx: SystemPromptContext = { entityId, organizationId, chainContext, orgData, entity };
      const toolCtx: ToolContext = { entityId, organizationId, tracker, userPrompt, parentVersionId, modelId, entity, orgData };

      const maxSteps = typeof config.maxSteps === 'function' ? config.maxSteps(entity) : config.maxSteps;
      const streamOverrides = config.getStreamOverrides ? config.getStreamOverrides(entity) : {};

      const result = streamText({
        model: openrouter(modelId),
        messages: convertedMessages as any,
        stopWhen: stepCountIs(maxSteps),
        system: config.buildSystemPrompt(systemPromptCtx),
        tools: config.buildTools(toolCtx),
        ...streamOverrides,
        onStepFinish: async ({ text, toolCalls, toolResults, usage }) => {
          const usageData = usage as { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } | undefined;
          const stepTokens = (usageData?.inputTokens ?? usageData?.promptTokens ?? 0) + (usageData?.outputTokens ?? usageData?.completionTokens ?? 0);
          const stepCredits = Math.max(1, Math.ceil(stepTokens / TOKENS_PER_CREDIT));
          tracker.totalTokens += stepTokens;
          tracker.totalCredits += stepCredits;
          await deductCreditsForUsage(organizationId, usage).catch(() => {});

          try {
            const parts: any[] = [];
            if (toolCalls && toolResults) {
              for (let i = 0; i < toolCalls.length; i++) {
                const tc = toolCalls[i] as any;
                const tr = toolResults[i] as any;
                parts.push({ type: `tool-${tc.toolName}`, toolCallId: tc.toolCallId, toolName: tc.toolName, args: tc.args, output: tr?.result || tr });
              }
            }
            if (text) parts.push({ type: 'text', text });
            if (parts.length > 0) {
              await config.saveMessage(tracker.currentVersionId, 'assistant', parts).catch(() => {});
            }
          } catch (e) {
            console.error(`[${config.entityIdParam}] Error saving step message:`, e);
          }
        },
        onFinish: async () => {
          if (!tracker.contentSaved) {
            await config.markVersionError(tracker.currentVersionId).catch(() => {});
          }
          if (tracker.totalTokens > 0) {
            await config.updateVersionUsage(tracker.currentVersionId, tracker.totalTokens, tracker.totalCredits).catch(() => {});
          }
        },
      });

      return result.toUIMessageStreamResponse();
    } catch (error) {
      console.error(`[${config.entityIdParam}] Chat handler failed:`, error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(`Chat failed: ${message}`, { status: 500 });
    }
  };
}
