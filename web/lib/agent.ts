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
 * The VLM (vision-language model) is called via an OpenAI-compatible API.
 * Configure with env vars:
 *   AGENT_BASE_URL   — default https://api.openai.com/v1
 *   AGENT_API_KEY    — required (or OPENAI_API_KEY)
 *   AGENT_MODEL      — default gpt-4o
 */

import OpenAI from 'openai'
import { getLatestFrame, sendToDevice, emitToListeners } from './relay'

const MAX_STEPS = 50
const STEP_DELAY_MS = 800  // ms to wait after sending an action before capturing next frame

function makeClient() {
  return new OpenAI({
    baseURL: process.env.AGENT_BASE_URL ?? 'https://api.openai.com/v1',
    apiKey:  process.env.AGENT_API_KEY ?? process.env.OPENAI_API_KEY ?? 'missing',
  })
}

const SYSTEM_PROMPT = `\
You are an AI agent controlling a remote computer. You receive a screenshot and \
must decide the single best next action to make progress toward the user's goal.

Rules:
- Use coordinates as fractions of screen size (0.0 = left/top, 1.0 = right/bottom).
- Choose "done" when the goal is fully achieved.
- Choose "wait" (1–3 seconds) when the UI is loading or animating.
- Be precise: click the exact element needed, not somewhere nearby.
- One action per response.`

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'take_action',
      description: 'Execute one computer-use action and advance toward the goal.',
      parameters: {
        type: 'object',
        required: ['action', 'reasoning'],
        properties: {
          reasoning: {
            type: 'string',
            description: 'Brief explanation of why this action moves toward the goal.',
          },
          action: {
            type: 'object',
            required: ['type'],
            properties: {
              type: {
                type: 'string',
                enum: ['click', 'right_click', 'double_click', 'drag', 'scroll',
                       'type', 'key', 'mouse_move', 'wait', 'done'],
              },
              x:         { type: 'number', description: 'Horizontal position 0.0–1.0' },
              y:         { type: 'number', description: 'Vertical position 0.0–1.0' },
              x1:        { type: 'number', description: 'Drag start X 0.0–1.0' },
              y1:        { type: 'number', description: 'Drag start Y 0.0–1.0' },
              x2:        { type: 'number', description: 'Drag end X 0.0–1.0' },
              y2:        { type: 'number', description: 'Drag end Y 0.0–1.0' },
              direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
              amount:    { type: 'number', description: 'Scroll steps (1–10)' },
              text:      { type: 'string', description: 'Text to type' },
              key:       { type: 'string', description: 'Key or combo e.g. "Return", "ctrl+c"' },
              seconds:   { type: 'number', description: 'Seconds to wait (1–5)' },
            },
          },
        },
      },
    },
  },
]

type Message = OpenAI.Chat.ChatCompletionMessageParam

function emit(deviceId: string, type: string, payload: Record<string, unknown>) {
  emitToListeners(deviceId, JSON.stringify({ type, ...payload }))
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * Run the agent loop for a device. Resolves when the task is done or the
 * step limit is reached. Caller should catch and log errors.
 */
export async function startAgentLoop(
  deviceId: string,
  goal: string,
  instructions: string
): Promise<void> {
  const client = makeClient()
  const history: Message[] = []

  emit(deviceId, 'agent:start', { goal })

  for (let step = 1; step <= MAX_STEPS; step++) {
    // ── 1. Get latest frame ────────────────────────────────────────────────
    // Wait up to 3s for a frame if none is available yet
    let frame: string | null = null
    for (let attempt = 0; attempt < 30 && !frame; attempt++) {
      frame = getLatestFrame(deviceId)
      if (!frame) await sleep(100)
    }

    if (!frame) {
      emit(deviceId, 'agent:error', { message: 'Device not sending frames — is it online?' })
      return
    }

    // ── 2. Build messages ──────────────────────────────────────────────────
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: `Goal: ${goal}${instructions ? `\n\nAdditional instructions: ${instructions}` : ''}\n\nStep: ${step}/${MAX_STEPS}`,
      },
      {
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${frame}`, detail: 'high' },
      },
    ]

    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userContent },
    ]

    // ── 3. Call VLM ────────────────────────────────────────────────────────
    let response: OpenAI.Chat.ChatCompletion
    try {
      response = await client.chat.completions.create({
        model:        process.env.AGENT_MODEL ?? 'gpt-4o',
        messages,
        tools:        TOOLS,
        tool_choice:  { type: 'function', function: { name: 'take_action' } },
        max_tokens:   512,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      emit(deviceId, 'agent:error', { message: `VLM call failed: ${msg}` })
      return
    }

    const choice = response.choices[0]
    const toolCall = choice.message.tool_calls?.[0]
    if (!toolCall) {
      emit(deviceId, 'agent:error', { message: 'VLM returned no tool call' })
      return
    }

    // ── 4. Parse action ────────────────────────────────────────────────────
    let parsed: { action: Record<string, unknown>; reasoning: string }
    try {
      parsed = JSON.parse(toolCall.function.arguments)
    } catch {
      emit(deviceId, 'agent:error', { message: 'Could not parse VLM response' })
      return
    }

    const { action, reasoning } = parsed
    emit(deviceId, 'agent:step', { step, action: action.type, reasoning })

    // ── 5. Done? ───────────────────────────────────────────────────────────
    if (action.type === 'done') {
      emit(deviceId, 'agent:done', { message: reasoning })
      return
    }

    // ── 6. Send action to Pi ───────────────────────────────────────────────
    const sent = sendToDevice(deviceId, JSON.stringify({ type: 'action', action }))
    if (!sent) {
      emit(deviceId, 'agent:error', { message: 'Device went offline mid-task' })
      return
    }

    // ── 7. Update history ──────────────────────────────────────────────────
    history.push({ role: 'user',      content: userContent })
    history.push({ role: 'assistant', content: choice.message.content ?? null,
                   tool_calls: choice.message.tool_calls })
    history.push({ role: 'tool',      tool_call_id: toolCall.id,
                   content: 'Action executed successfully.' })

    // Keep history bounded to last 10 turns (to avoid token bloat)
    if (history.length > 30) history.splice(0, 3)

    // ── 8. Wait for Pi to execute and send a fresh frame ──────────────────
    await sleep(STEP_DELAY_MS)
  }

  emit(deviceId, 'agent:done', { message: `Reached step limit (${MAX_STEPS})` })
}
