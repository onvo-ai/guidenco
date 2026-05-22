/**
 * agent.ts — Web-side agent loop.
 *
 * Runs in server.ts (the custom Node.js server), sharing the same relay.ts
 * module instance as the WebSocket upgrade handler. This means it can read
 * the Pi's live frame buffer and send actions back via the WebSocket.
 *
 * Protocol:
 *   Pi → server: {"type":"frame","data":"<base64 jpeg>"}   (continuous)
 *   server → Pi: {"type":"action","action":{...}}           (per step)
 *
 * VLM: Ollama Cloud via @ai-sdk/openai (OpenAI-compatible /v1 endpoint).
 * Configure with env vars:
 *   AGENT_BASE_URL  — Ollama base URL, default https://ollama.com/v1
 *   AGENT_API_KEY   — bearer token
 *   AGENT_MODEL     — model name, default qwen3-vl:235b-instruct-cloud
 */

import { generateText, tool, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { getLatestFrame, sendToDevice, emitToListeners } from './relay'

const MAX_STEPS     = 50
const STEP_DELAY_MS = 800

// Pi screen resolution — used to convert pixel coords to fractions for the HID layer
const SCREEN_W = 1920
const SCREEN_H = 1080

// Ollama Cloud exposes an OpenAI-compatible endpoint at /v1
const BASE_URL = (process.env.AGENT_BASE_URL ?? 'https://ollama.com/v1')
  .replace(/\/api(\/chat)?$/, '/v1')   // normalise if user pasted native URL
const API_KEY  = process.env.AGENT_API_KEY ?? process.env.OPENAI_API_KEY ?? ''
const MODEL    = process.env.AGENT_MODEL   ?? 'qwen3-vl:235b-instruct-cloud'

const ollama = createOpenAI({
  baseURL: BASE_URL,
  apiKey:  API_KEY,
})

const SYSTEM_PROMPT = `\
You are an AI agent controlling a remote Windows computer at 1920×1080 resolution. \
You receive a screenshot and must decide the single best next action to make progress \
toward the user's goal.

Rules:
- Use the coordinate field with absolute pixel positions [x, y] on the 1920×1080 screen.
- Set action_type to "done" when the goal is fully achieved.
- Set action_type to "wait" (seconds 1–3) when the UI is loading or animating.
- Be precise: click the exact element needed, not somewhere nearby.
- One action per response.`

// Flat schema — qwen3 reliably fills flat tool call parameters.
// coordinate: [x, y] in absolute pixels (model's natural format); x/y fields are
// the fractional fallback. buildAction converts pixels → fractions for the Pi HID layer.
const TakeActionSchema = z.object({
  reasoning:   z.string().optional().describe('Brief explanation of why this action moves toward the goal.'),
  action_type: z.enum(['click', 'right_click', 'double_click', 'drag', 'scroll',
                       'type', 'key', 'mouse_move', 'wait', 'done'])
                .describe('The type of action to perform.'),
  coordinate: z.tuple([z.number(), z.number()]).optional()
               .describe('Absolute pixel position [x, y] on the 1920×1080 screen. Use for click, right_click, double_click, mouse_move, scroll.'),
  start_coordinate: z.tuple([z.number(), z.number()]).optional()
                     .describe('Drag start position [x, y] in pixels.'),
  end_coordinate:   z.tuple([z.number(), z.number()]).optional()
                     .describe('Drag end position [x, y] in pixels.'),
  // Fractional fallback fields (0.0–1.0) — accepted but coordinate is preferred
  x:         z.number().optional().describe('X position 0.0–1.0 (fraction of screen width). Prefer coordinate instead.'),
  y:         z.number().optional().describe('Y position 0.0–1.0 (fraction of screen height). Prefer coordinate instead.'),
  x1:        z.number().optional().describe('Drag start X, fraction 0.0–1.0.'),
  y1:        z.number().optional().describe('Drag start Y, fraction 0.0–1.0.'),
  x2:        z.number().optional().describe('Drag end X, fraction 0.0–1.0.'),
  y2:        z.number().optional().describe('Drag end Y, fraction 0.0–1.0.'),
  direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction.'),
  amount:    z.number().optional().describe('Scroll steps 1–10.'),
  text:      z.string().optional().describe('Text to type.'),
  key:       z.string().optional().describe('Key or combo e.g. "Return", "ctrl+c".'),
  seconds:   z.number().optional().describe('Seconds to wait, 1–5.'),
})

type TakeActionArgs = z.infer<typeof TakeActionSchema>

const TOOLS = {
  take_action: tool({
    description: 'Execute one computer-use action to advance toward the goal.',
    parameters: TakeActionSchema,
  }),
}

// ── Helpers ────────────────────────────────────────────────────────────────

function emit(deviceId: string, type: string, payload: Record<string, unknown>) {
  emitToListeners(deviceId, JSON.stringify({ type, ...payload }))
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Convert absolute pixel value to fraction (0.0–1.0) clamped to [0, 1]. */
function px(val: number, range: number): number {
  // If already fractional (model occasionally does this), keep it
  if (val >= 0 && val <= 1) return val
  return Math.max(0, Math.min(1, val / range))
}

function buildAction(args: TakeActionArgs): Record<string, unknown> {
  const {
    action_type,
    coordinate, start_coordinate, end_coordinate,
    x, y, x1, y1, x2, y2,
    direction, amount, text, key, seconds,
  } = args

  // Resolve primary x/y: prefer coordinate (pixel array) → fractional x/y fields
  const fx = coordinate ? px(coordinate[0], SCREEN_W) : x
  const fy = coordinate ? px(coordinate[1], SCREEN_H) : y

  // Resolve drag start/end
  const fx1 = start_coordinate ? px(start_coordinate[0], SCREEN_W) : x1
  const fy1 = start_coordinate ? px(start_coordinate[1], SCREEN_H) : y1
  const fx2 = end_coordinate   ? px(end_coordinate[0],   SCREEN_W) : x2
  const fy2 = end_coordinate   ? px(end_coordinate[1],   SCREEN_H) : y2

  return Object.fromEntries(
    Object.entries({
      type: action_type,
      x: fx, y: fy,
      x1: fx1, y1: fy1, x2: fx2, y2: fy2,
      direction, amount, text, key, seconds,
    }).filter(([, v]) => v !== undefined)
  )
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function startAgentLoop(
  deviceId: string,
  goal: string,
  instructions: string
): Promise<void> {
  // history holds assistant + tool-result pairs between steps.
  // Each step prepends a fresh user message with the latest screenshot.
  const history: ModelMessage[] = []

  emit(deviceId, 'agent:start', { goal })

  for (let step = 1; step <= MAX_STEPS; step++) {
    // ── 1. Grab latest frame ───────────────────────────────────────────────
    let frame: string | null = null
    for (let i = 0; i < 30 && !frame; i++) {
      frame = getLatestFrame(deviceId)
      if (!frame) await sleep(100)
    }
    if (!frame) {
      emit(deviceId, 'agent:error', { message: 'Device not sending frames — is it online?' })
      return
    }

    // ── 2. Build user message with fresh screenshot ────────────────────────
    const userMsg: CoreMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Goal: ${goal}${instructions ? `\n\nAdditional instructions: ${instructions}` : ''}\n\nStep ${step}/${MAX_STEPS}. Decide the next action.`,
        },
        {
          type: 'image',
          image: Buffer.from(frame, 'base64'),
          mediaType: 'image/jpeg' as const,
        },
      ],
    }

    // ── 3. Call VLM (one step, no auto-execute) ────────────────────────────
    let result: Awaited<ReturnType<typeof generateText>>
    try {
      result = await generateText({
        model:       ollama(MODEL),
        system:      SYSTEM_PROMPT,
        messages:    [...history, userMsg],
        tools:       TOOLS,
        toolChoice:  { type: 'tool', toolName: 'take_action' },
        maxSteps:    1,   // one VLM call per iteration; we drive the loop manually
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      emit(deviceId, 'agent:error', { message: `VLM call failed: ${msg}` })
      return
    }

    // ── 4. Extract tool call ───────────────────────────────────────────────
    const toolCall = result.toolCalls?.[0]
    console.log('[agent] toolCall raw:', JSON.stringify(toolCall).slice(0, 600))
    if (!toolCall || toolCall.toolName !== 'take_action') {
      emit(deviceId, 'agent:error', { message: 'VLM returned no tool call.' })
      return
    }

    // In AI SDK 6 with @ai-sdk/openai the parsed args live on .args;
    // some model responses put them on .input instead — handle both.
    const rawInput: unknown = (toolCall as any).args ?? (toolCall as any).input ?? {}
    const rawArgs: Record<string, unknown> =
      typeof rawInput === 'string' ? JSON.parse(rawInput) : (rawInput as Record<string, unknown>)

    const action_type = rawArgs.action_type as TakeActionArgs['action_type'] | undefined
    const reasoning   = rawArgs.reasoning   as string | undefined

    console.log('[agent] action_type:', action_type, '| reasoning:', reasoning?.slice(0, 80))

    if (!action_type) {
      emit(deviceId, 'agent:error', { message: 'VLM tool call missing action_type.' })
      return
    }

    emit(deviceId, 'agent:step', { step, action: action_type, reasoning: reasoning ?? '' })

    // ── 5. Done? ───────────────────────────────────────────────────────────
    if (action_type === 'done') {
      emit(deviceId, 'agent:done', { message: reasoning ?? 'Task complete.' })
      return
    }

    // ── 6. Send action to Pi ───────────────────────────────────────────────
    const action = buildAction(rawArgs as TakeActionArgs)
    console.log('[agent] sending action:', JSON.stringify(action))
    const sent = sendToDevice(deviceId, JSON.stringify({ type: 'action', action }))
    if (!sent) {
      emit(deviceId, 'agent:error', { message: 'Device went offline mid-task.' })
      return
    }

    // ── 7. Update history ─────────────────────────────────────────────────
    // Build CoreMessages manually — don't rely on result.responseMessages
    // which is not reliably populated in all AI SDK 6 / provider combos.
    // In AI SDK 6, ToolCallPart uses `input` (not `args`) and
    // ToolResultPart uses `output` (not `result`).
    history.push({
      role: 'assistant',
      content: [
        {
          type:       'tool-call',
          toolCallId: toolCall.toolCallId,
          toolName:   'take_action',
          input:      rawArgs,
        },
      ],
    } as any)
    history.push({
      role: 'tool',
      content: [
        {
          type:       'tool-result',
          toolCallId: toolCall.toolCallId,
          toolName:   'take_action',
          output:     { type: 'text', value: 'Action executed successfully.' },
        },
      ],
    } as any)

    // Keep history bounded (last 10 turns = 20 messages)
    if (history.length > 20) history.splice(0, 2)

    // ── 8. Wait for Pi to execute before capturing next frame ─────────────
    await sleep(STEP_DELAY_MS)
  }

  emit(deviceId, 'agent:done', { message: `Reached step limit (${MAX_STEPS}).` })
}
