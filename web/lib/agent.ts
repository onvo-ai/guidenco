/**
 * agent.ts — Web-side agent loop.
 *
 * Mirrors the original pre-refactor service/agent design:
 *   - Separate named tools (left_click, double_click, type_text, key, …)
 *   - 1–1000 integer coordinate space (matches Pi COORD_SPACE; converted to
 *     fraction before sending so Pi's _frac_to_coord keeps it intact)
 *   - Text history in every user message (model always sees what it did)
 *   - Todo list / planning phase (first step: plan only)
 *   - Loop detection → auto-Escape + warning
 *   - think:true sent in extra_body for extended reasoning
 *
 * Pi protocol:
 *   Pi → server: {"type":"frame","data":"<base64 jpeg>"}   (continuous)
 *   server → Pi: {"type":"action","action":{…}}             (per action)
 *
 * Env vars:
 *   AGENT_BASE_URL  — Ollama base URL (default https://ollama.com/v1)
 *   AGENT_API_KEY   — bearer token
 *   AGENT_MODEL     — model name (default qwen3-vl:235b-instruct-cloud)
 */

import { generateText, tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { getLatestFrame, waitForFreshFrame, sendToDevice, emitToListeners, clearAgentStop, isAgentStopRequested } from './relay'
import { db } from './db/client'
import { secrets } from './db/schema'
import { devices } from './db/schema'
import { eq } from 'drizzle-orm'

const MAX_STEPS     = 20
const STEP_DELAY_MS        = 800    // between actions within a step
const LAUNCH_DELAY_MS      = 3000   // extra wait after launching an app (double_click, win key)
const PAGE_LOAD_DELAY_MS   = 2500   // extra wait after return/enter — fresh-frame guarantee covers the rest

// Ollama Cloud OpenAI-compatible endpoint
const BASE_URL = (process.env.AGENT_BASE_URL ?? 'https://ollama.com/v1')
  .replace(/\/api(\/chat)?$/, '/v1')
const API_KEY  = process.env.AGENT_API_KEY ?? process.env.OPENAI_API_KEY ?? ''
const MODEL    = process.env.AGENT_MODEL   ?? 'qwen3-vl:235b-instruct-cloud'

const ollamaProvider = createOpenAI({ baseURL: BASE_URL, apiKey: API_KEY })

// ── System prompt (mirrors original) ──────────────────────────────────────

const SYSTEM_PROMPT = `You are a Windows automation agent controlling a Windows PC via USB HID gadget.

Coordinate space: X 1–1000 (left→right), Y 1–1000 (top→bottom).

TOOLS:
- left_click(x,y), double_click(x,y), right_click(x,y), hover(x,y)
- drag(x1,y1,x2,y2)
- key(key): e.g. 'ctrl+l', 'ctrl+t', 'ctrl+w', 'alt+f4', 'win', 'return', 'escape', 'tab'
- type_text(text): types into the focused element
- scroll(x,y,direction,amount): direction up/down/left/right, amount 1–10
- wait(seconds): 1–5 seconds
- add_todo_item(text): add a step to the visible todo list
- complete_todo_item(text): mark a todo done
- task_done(result,success): call when the goal is fully achieved. The result MUST contain the actual answer or outcome — e.g. for "what is X?" write the answer in result, not just "done".

CLICK RULES:
- Desktop icons (on the wallpaper): double_click
- Taskbar icons (bottom bar): left_click
- Everything else (buttons, fields, menu items, links): left_click

KEYBOARD SHORTCUTS — always prefer these over clicking small targets:
- Open/search an app: key('win') → type_text(name) → key('return')
- Close window: key('alt+f4')
- Close browser tab: key('ctrl+w')
- New browser tab: key('ctrl+t')
- Focus browser address bar: key('ctrl+l')
- Browser navigate/search: key('ctrl+l') → type_text(url_or_query) → key('return')

RULES:
1. Look at the screenshot before every action. If the goal is already achieved, call task_done immediately.
2. Use add_todo_item to plan when the task has multiple steps — but you can also act and plan in the same step.
3. Call complete_todo_item as soon as you take the action, not after seeing the result.
4. After any navigation or app launch, the next screenshot shows the result — read it before acting again.
5. If an action fails twice, switch to a completely different approach.
6. Never repeat the exact same failing action more than twice.
7. Aim for the CENTER of elements when clicking.
8. This is Windows: use ctrl (not cmd), win key (not cmd).`

// ── Tools ─────────────────────────────────────────────────────────────────

// qwen-vl sometimes outputs x: [x, y] (a pair array) instead of x, y separately.
// Accept both so Zod validation doesn't reject valid model output.
const coordField = z.union([
  z.number().int().min(1).max(1000),
  z.array(z.number()).length(2),
]).describe('coordinate 1–1000, or [x,y] pair')
const XY = {
  x: coordField.describe('X position 1–1000, or [x,y] pair'),
  y: z.number().int().min(1).max(1000).optional().describe('Y position 1–1000 (omit when x is a pair)'),
}

const TOOLS = {
  left_click:   tool({ description: 'Single left-click at (x,y).', inputSchema: z.object(XY) }),
  double_click: tool({ description: 'Double left-click at (x,y). Use to open apps/files.', inputSchema: z.object(XY) }),
  right_click:  tool({ description: 'Right-click at (x,y) for context menus.', inputSchema: z.object(XY) }),
  hover:        tool({ description: 'Move mouse to (x,y) without clicking.', inputSchema: z.object(XY) }),
  drag: tool({
    description: 'Click-drag from (x1,y1) to (x2,y2).',
    inputSchema: z.object({
      x1: z.number().int().min(1).max(1000), y1: z.number().int().min(1).max(1000),
      x2: z.number().int().min(1).max(1000), y2: z.number().int().min(1).max(1000),
    }),
  }),
  scroll: tool({
    description: 'Scroll at (x,y). direction: up/down/left/right. amount: 1–10 steps.',
    inputSchema: z.object({
      x: z.number().int().min(1).max(1000), y: z.number().int().min(1).max(1000),
      direction: z.enum(['up', 'down', 'left', 'right']),
      amount: z.number().int().min(1).max(10),
    }),
  }),
  type_text: tool({ description: 'Type literal text. Focus the field first with left_click.', inputSchema: z.object({ text: z.string() }) }),
  key: tool({ description: 'Press a key or combo, e.g. "return", "ctrl+c", "win+e", "escape".', inputSchema: z.object({ key: z.string() }) }),
  wait: tool({ description: 'Wait N seconds for UI to load or animate.', inputSchema: z.object({ seconds: z.number().min(1).max(5) }) }),
  add_todo_item: tool({ description: 'Add a step to the todo list. Use on the first step to plan.', inputSchema: z.object({ text: z.string() }) }),
  complete_todo_item: tool({ description: 'Mark a todo item done by matching its text.', inputSchema: z.object({ text: z.string() }) }),
  task_done: tool({
    description: 'Signal the task is complete. All todo items must be marked done first.',
    inputSchema: z.object({ result: z.string().describe('What was accomplished'), success: z.boolean() }),
  }),
}

// ── Helpers ───────────────────────────────────────────────────────────────

function emit(deviceId: string, type: string, payload: Record<string, unknown>) {
  emitToListeners(deviceId, JSON.stringify({ type, ...payload }))
}

// Per-loop secret map populated at startAgentLoop. The LLM never sees these
// values — it only references them by name via {{KEY}} in type_text calls.
let activeSecrets: Map<string, string> = new Map()

/** Replace {{KEY}} occurrences with the secret value. Unknown keys stay as-is. */
function substituteSecrets(text: string): string {
  if (!text.includes('{{')) return text
  return text.replace(/\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g, (m, key) => {
    return activeSecrets.has(key) ? activeSecrets.get(key)! : m
  })
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

/** Convert 1–1000 integer coord to 0.0–1.0 fraction for Pi. */
function frac(v: number): number { return Math.max(0, Math.min(1, v / 1000)) }

/**
 * Normalize coordinates from the model output.
 * qwen-vl natively outputs coordinates as x:[x,y] (array in the x field).
 * We also accept the standard {x, y} format and {coordinate:[x,y]}.
 */
function normalizeXY(input: Record<string, unknown>): { x: number; y: number } {
  // Array in x field: {x: [447, 831]}
  if (Array.isArray(input.x) && input.x.length >= 2) {
    return { x: Number(input.x[0]), y: Number(input.x[1]) }
  }
  // Separate coordinate field: {coordinate: [447, 831]}
  if (Array.isArray(input.coordinate) && (input.coordinate as number[]).length >= 2) {
    return { x: Number((input.coordinate as number[])[0]), y: Number((input.coordinate as number[])[1]) }
  }
  // Standard: {x: 447, y: 831}
  return { x: Number(input.x ?? 500), y: Number(input.y ?? 500) }
}

/** Build a Pi action dict from a tool call. Returns null for meta-tools. */
function toolToAction(name: string, input: Record<string, unknown>): Record<string, unknown> | null {
  const { x: rawX, y: rawY } = normalizeXY(input)
  const x = frac(rawX)
  const y = frac(rawY)
  switch (name) {
    case 'left_click':   return { type: 'click',        x, y }
    case 'double_click': return { type: 'double_click', x, y }
    case 'right_click':  return { type: 'right_click',  x, y }
    case 'hover':        return { type: 'mouse_move',   x, y }
    case 'drag': {
      // Drag may also use array format: x1:[x1,y1], x2:[x2,y2]
      const p1 = normalizeXY({ x: input.x1, y: input.y1 })
      const p2 = normalizeXY({ x: input.x2, y: input.y2 })
      return { type: 'drag', x1: frac(p1.x), y1: frac(p1.y), x2: frac(p2.x), y2: frac(p2.y) }
    }
    case 'scroll': return {
      type: 'scroll', x, y,
      direction: input.direction ?? 'down',
      amount: Math.min(10, Math.max(1, Number(input.amount ?? 3))),
    }
    case 'type_text': return { type: 'type', text: substituteSecrets(String(input.text ?? '')) }
    case 'key':  return { type: 'key',  key:     String(input.key ?? '') }
    case 'wait': return { type: 'wait', seconds: Number(input.seconds ?? 1) }
    default: return null  // meta-tools (add_todo, complete_todo, task_done)
  }
}

/** Human-readable detail string for a tool call. */
function toolDetail(name: string, input: Record<string, unknown>): string {
  const { x, y } = normalizeXY(input)
  switch (name) {
    case 'left_click':
    case 'double_click':
    case 'right_click':
    case 'hover':
      return `(${x}, ${y})`
    case 'drag': {
      const p1 = normalizeXY({ x: input.x1, y: input.y1 })
      const p2 = normalizeXY({ x: input.x2, y: input.y2 })
      return `(${p1.x},${p1.y}) → (${p2.x},${p2.y})`
    }
    case 'scroll': return `${input.direction} ×${input.amount}`
    case 'type_text': return `"${String(input.text ?? '').slice(0, 40)}"`
    case 'key':   return String(input.key ?? '')
    case 'wait':  return `${input.seconds}s`
    default: return ''
  }
}

/**
 * Extract thinking/reasoning from a generateText result.
 * Handles multiple formats:
 *   1. AI SDK 6 per-step reasoning: result.steps[0].reasoning
 *   2. Top-level reasoning field:   result.reasoning
 *   3. <think>…</think> in text:   parse it out
 *   4. Plain text response:         use as-is
 * Returns empty string if nothing useful found.
 */
function extractReasoning(result: unknown): string {
  const r = result as any

  // 1. AI SDK 6 per-step reasoning (most reliable)
  const stepR = r?.steps?.[0]?.reasoning
  if (typeof stepR === 'string' && stepR.trim()) return stepR.trim()

  // 2. Top-level reasoning field
  const topR = r?.reasoning
  if (typeof topR === 'string' && topR.trim()) return topR.trim()

  // 3. Text may contain <think>…</think> tags (Ollama Cloud / qwen3 format)
  const text: string = r?.text ?? r?.steps?.[0]?.text ?? ''
  if (text) {
    const m = text.match(/<think>([\s\S]*?)<\/think>/i)
    if (m) {
      const inner = m[1].trim()
      if (inner) return inner
    }
    // Plain text with no tool calls: use directly if non-trivial
    const trimmed = text.trim()
    if (trimmed.length > 5) return trimmed
  }

  return ''
}

/** Text description for history. */
function toolDesc(name: string, input: Record<string, unknown>): string {
  const d = toolDetail(name, input)
  return d ? `${name}${d}` : name
}

/** Repeating-action signature for loop detection. */
function actionSig(tools: Array<{ name: string; input: Record<string, unknown> }>): string {
  return tools.filter(t => !['add_todo_item','complete_todo_item','task_done','wait'].includes(t.name))
    .map(t => {
      const { x, y } = normalizeXY(t.input)
      const coord = (t.input.x !== undefined || t.input.coordinate !== undefined) ? `${x},${y}` : ''
      return `${t.name}(${coord || t.input.key || t.input.text || ''})`
    })
    .join('|')
}

// ── Public API ────────────────────────────────────────────────────────────

export async function startAgentLoop(
  deviceId: string,
  goal: string,
  instructions: string,
): Promise<void> {
  const history: string[]  = []
  const todoItems: Array<{ text: string; done: boolean }> = []
  const prevSigs: string[] = []
  let   loopWarning        = ''
  let   noProgressCount    = 0       // bail if too many empty iterations
  let   lastActionAt       = 0       // when the last action + its delay completed

  // Load this user's secrets so {{KEY}} substitution works in type_text
  activeSecrets = new Map()
  const secretBlurb = await (async () => {
    try {
      const [dev] = await db
        .select({ userId: devices.userId })
        .from(devices)
        .where(eq(devices.id, deviceId))
        .limit(1)
      if (!dev) return ''
      const rows = await db
        .select({ key: secrets.key, description: secrets.description })
        .from(secrets)
        .where(eq(secrets.userId, dev.userId))
      // Also load values into activeSecrets (kept server-side; never sent to LLM)
      const valueRows = await db
        .select({ key: secrets.key, value: secrets.value })
        .from(secrets)
        .where(eq(secrets.userId, dev.userId))
      for (const r of valueRows) activeSecrets.set(r.key, r.value)

      if (rows.length === 0) return ''
      const lines = rows.map(r => `  - {{${r.key}}}${r.description ? ` — ${r.description}` : ''}`).join('\n')
      return `\nAvailable secrets (use the {{KEY}} placeholder verbatim in type_text — the server will substitute the actual value before sending to the device. DO NOT try to guess values):\n${lines}`
    } catch (err) {
      console.error('[agent] failed to load secrets:', err)
      return ''
    }
  })()

  clearAgentStop(deviceId)   // reset any previous stop request
  emit(deviceId, 'agent:start', { goal })

  for (let step = 1; step <= MAX_STEPS; step++) {
    // ── 0. Check stop flag ────────────────────────────────────────────────
    if (isAgentStopRequested(deviceId)) {
      emit(deviceId, 'agent:error', { message: 'Stopped by user.' })
      return
    }

    // ── 1. Grab latest frame (fresh after previous actions) ──────────────
    let frame: string | null = null
    if (lastActionAt > 0) {
      frame = await waitForFreshFrame(deviceId, lastActionAt, 10_000)
    } else {
      for (let i = 0; i < 30 && !frame; i++) { frame = getLatestFrame(deviceId); if (!frame) await sleep(100) }
    }
    if (!frame) { emit(deviceId, 'agent:error', { message: 'Device not sending frames.' }); return }

    // ── 2. Build user message with history + todo + screenshot ────────────
    const todoText = todoItems.length
      ? todoItems.map((t, i) => `  ${i + 1}. [${t.done ? 'done' : 'open'}] ${t.text}`).join('\n')
      : '  (none)'
    const histText = history.length
      ? history.map((h, i) => `  Step ${i + 1}: ${h}`).join('\n')
      : '  (none)'
    let userText = [
      `Goal: ${goal}`,
      instructions ? `Additional instructions: ${instructions}` : '',
      secretBlurb,
      `\nCurrent todo list:\n${todoText}`,
      `\nActions taken so far:\n${histText}`,
      `\nStep ${step}/${MAX_STEPS}. Here is the current screenshot. Write a short progress update and call tools to make progress.`,
      loopWarning ? `\nWARNING: ${loopWarning}` : '',
    ].filter(Boolean).join('\n')

    // ── 3. Call VLM (with retry on transient errors) ──────────────────────
    let result!: Awaited<ReturnType<typeof generateText>>
    {
      const VLM_RETRIES = 3
      const VLM_RETRY_DELAY_MS = 2000
      let lastErr: unknown
      let succeeded = false
      for (let attempt = 1; attempt <= VLM_RETRIES; attempt++) {
        try {
          result = await generateText({
            model: ollamaProvider(MODEL),
            system: SYSTEM_PROMPT,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: userText },
                { type: 'image', image: Buffer.from(frame, 'base64'), mediaType: 'image/jpeg' as const },
              ],
            }],
            tools: TOOLS,
            toolChoice: 'required',
            maxSteps: 1,
            temperature: 0.1,
            providerOptions: { openai: { think: true, parallelToolCalls: true } },
          } as any)
          succeeded = true
          break
        } catch (err) {
          lastErr = err
          console.warn(`[agent ${deviceId}] VLM attempt ${attempt}/${VLM_RETRIES} failed:`, err instanceof Error ? err.message : String(err))
          if (attempt < VLM_RETRIES) await sleep(VLM_RETRY_DELAY_MS * attempt)
        }
      }
      if (!succeeded) {
        const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
        emit(deviceId, 'agent:error', { message: `VLM call failed after ${VLM_RETRIES} attempts: ${msg}` })
        return
      }
    }

    // ── 4. Process tool calls ─────────────────────────────────────────────
    const calls = (result!.toolCalls ?? []) as Array<{ toolName: string; input?: unknown; args?: unknown; toolCallId: string }>
    console.log(`[agent ${deviceId}] step ${step} calls:`, calls.map(c => `${c.toolName}(${JSON.stringify(c.input ?? c.args ?? {}).slice(0, 60)})`).join(', '))
    if (!calls.length) {
      noProgressCount++
      // If the model has already executed at least one action and then stops
      // producing tool calls, it almost certainly completed the task but failed
      // to format task_done. Infer success rather than erroring.
      if (lastActionAt > 0 && noProgressCount >= 2) {
        // Use the model's text response as the result if it returned one
        const inferredResult = (result!.text ?? '').trim() || 'Task completed.'
        emit(deviceId, 'agent:done', { message: inferredResult, success: true })
        return
      }
      if (noProgressCount >= 3) {
        emit(deviceId, 'agent:error', { message: 'VLM returned no tool calls 3 times in a row. Aborting.' })
        return
      }
      loopWarning = 'You must call at least one tool. If the task is complete, call task_done.'
      continue
    }

    const stepActions: Array<{ name: string; input: Record<string, unknown> }> = []
    let taskDone     = false
    let taskResult   = ''
    let taskSuccess  = true
    let todosChanged = false

    for (const tc of calls) {
      const name  = tc.toolName
      const input = (tc.input ?? tc.args ?? {}) as Record<string, unknown>

      if (name === 'add_todo_item') {
        const text = String(input.text ?? '').trim()
        if (text) { todoItems.push({ text, done: false }); todosChanged = true }
        continue
      }
      if (name === 'complete_todo_item') {
        const target = String(input.text ?? '').toLowerCase()
        const match  = todoItems.find(t => !t.done && t.text.toLowerCase().includes(target))
        if (match) { match.done = true; todosChanged = true }
        continue
      }
      if (name === 'task_done') {
        taskDone    = true
        taskResult  = String(input.result ?? 'Done.')
        taskSuccess = Boolean(input.success ?? true)
        continue
      }

      // Action tool
      stepActions.push({ name, input })
    }

    if (todosChanged) emit(deviceId, 'agent:todo', { items: todoItems })

    // No-progress kill switch: if only todo metadata changed (no actions, no task_done),
    // count it but don't abort yet. If nothing at all happened 3 times, abort.
    if (!stepActions.length && !taskDone) {
      if (!todosChanged) {
        noProgressCount++
        if (noProgressCount >= 3) {
          emit(deviceId, 'agent:error', { message: 'Agent made no progress for 3 consecutive steps. Aborting.' })
          return
        }
        loopWarning = 'No progress. Call an action tool (click, type, key, etc.) or call task_done if the goal is complete.'
      }
      continue
    }
    noProgressCount = 0

    // ── 5. Done? ──────────────────────────────────────────────────────────
    if (taskDone) {
      if (taskSuccess) {
        emit(deviceId, 'agent:done', { message: taskResult, success: true })
      } else {
        emit(deviceId, 'agent:error', { message: taskResult })
      }
      return
    }

    // ── 6. Loop detection ─────────────────────────────────────────────────
    const sig = actionSig(stepActions)
    loopWarning = ''
    // Stuck if:
    //   (a) the exact same signature appears 3 times in a row, OR
    //   (b) the same signature shows up >=3 times in the last 6 steps (catches
    //       alternating patterns like ctrl+a → type → ctrl+a → type → …)
    const tail6 = prevSigs.slice(-5)
    const occurrencesInWindow = sig ? tail6.filter(s => s === sig).length + 1 : 0
    const triple = sig && prevSigs.length >= 2 && sig === prevSigs.at(-1) && sig === prevSigs.at(-2)
    const alternating = sig && occurrencesInWindow >= 3
    const stuck = triple || alternating
    if (stuck) {
      sendToDevice(deviceId, JSON.stringify({ type: 'action', action: { type: 'key', key: 'escape' } }))
      await sleep(800)
      const hasType = stepActions.some(a => a.name === 'type_text')
      loopWarning = hasType
        ? 'STUCK: Text entry keeps failing. The field probably did not have focus, or autocomplete is intercepting. Escape sent. Click DIRECTLY on the input field once (single left_click in its center), then immediately type — do NOT press ctrl+a first.'
        : 'STUCK: Same actions repeated with no progress. Escape sent. Try a completely different approach — e.g. use the keyboard (Tab, Alt+letter) instead of clicking, or scroll to find the element.'
    }
    if (sig) prevSigs.push(sig)

    // ── 7. Emit step + execute actions on Pi ──────────────────────────────
    // Include model reasoning/text on the first tool call; empty for subsequent.
    // Priority: per-step reasoning → top-level reasoning → <think> in text → raw text
    const stepReasoning = extractReasoning(result)
    let firstEmit = true
    for (const { name, input } of stepActions) {
      const detail = toolDetail(name, input)
      emit(deviceId, 'agent:step', { step, action: name, detail, reasoning: firstEmit ? stepReasoning : '' })
      firstEmit = false

      const action = toolToAction(name, input)
      if (!action) continue
      if (action.type === 'wait') { await sleep(Number(action.seconds ?? 1) * 1000); continue }

      const sent = sendToDevice(deviceId, JSON.stringify({ type: 'action', action }))
      if (!sent) { emit(deviceId, 'agent:error', { message: 'Device went offline mid-task.' }); return }

      await sleep(STEP_DELAY_MS)

      // Extra pause after actions that typically launch apps or navigate, so
      // the UI finishes loading before the next screenshot is taken.
      if (name === 'double_click') {
        await sleep(LAUNCH_DELAY_MS)
      } else if (name === 'key') {
        const k = String(input.key ?? '').toLowerCase()
        if (k === 'return' || k === 'enter') {
          // Enter usually submits/navigates — wait for the page to load
          await sleep(PAGE_LOAD_DELAY_MS)
        } else if (k === 'win' || k === 'alt+f4') {
          await sleep(LAUNCH_DELAY_MS)
        }
      }
    }

    // Record timestamp after all actions + delays so next iteration grabs a fresh frame
    if (stepActions.some(a => toolToAction(a.name, a.input) !== null)) {
      lastActionAt = Date.now()
    }

    // ── 8. Update text history ────────────────────────────────────────────
    const stepDesc = stepActions.map(a => toolDesc(a.name, a.input)).join(' + ')
    if (stepDesc) history.push(stepDesc)
    if (history.length > 30) history.splice(0, history.length - 30)
  }

  emit(deviceId, 'agent:error', { message: `Reached step limit (${MAX_STEPS}).` })
}
