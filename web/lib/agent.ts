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
import { getLatestFrame, sendToDevice, emitToListeners, clearAgentStop, isAgentStopRequested } from './relay'
import { db } from './db/client'
import { secrets } from './db/schema'
import { devices } from './db/schema'
import { eq } from 'drizzle-orm'

const MAX_STEPS     = 20
const STEP_DELAY_MS        = 1200   // between actions within a step
const LAUNCH_DELAY_MS      = 1500   // extra wait after launching an app (double_click, win key)
const PAGE_LOAD_DELAY_MS   = 4000   // extra wait after return/enter — full page load can be slow

// Ollama Cloud OpenAI-compatible endpoint
const BASE_URL = (process.env.AGENT_BASE_URL ?? 'https://ollama.com/v1')
  .replace(/\/api(\/chat)?$/, '/v1')
const API_KEY  = process.env.AGENT_API_KEY ?? process.env.OPENAI_API_KEY ?? ''
const MODEL    = process.env.AGENT_MODEL   ?? 'qwen3-vl:235b-instruct-cloud'

const ollamaProvider = createOpenAI({ baseURL: BASE_URL, apiKey: API_KEY })

// ── System prompt (mirrors original) ──────────────────────────────────────

const SYSTEM_PROMPT = `You are a Windows automation agent controlling a Windows PC via USB HID gadget.

Coordinate space: X 1–1000 (left→right), Y 1–1000 (top→bottom).

AVAILABLE TOOLS:
- left_click(x,y): Single left-click. Use for: buttons, links, menus, taskbar icons, Start Menu items, form fields.
- double_click(x,y): Double left-click. Use for: DESKTOP icons (to open apps or files), File Explorer files/folders, any icon sitting on the wallpaper background.
- right_click(x,y): Right-click for context menus.
- hover(x,y): Move the mouse without clicking. Use to reveal tooltips or hover menus.
- drag(x1,y1,x2,y2): Click-drag from point to point.
- key(key): Press a key or combo. Examples: 'ctrl+c', 'ctrl+v', 'win+e', 'alt+f4', 'return', 'escape', 'tab'.
- type_text(text): Type literal text characters into a focused field.
- scroll(x,y,direction,amount): Scroll at position. direction: up/down/left/right. amount: 1–10.
- wait(seconds): Pause 1–5 seconds before next screenshot.
- add_todo_item(text): Add a new item to the todo list. Use on the FIRST step to create your plan.
- complete_todo_item(text): Mark a todo item done. Call as soon as you SEE it is completed.
- task_done(result,success): Call ONLY when every todo item is marked done AND the task is fully complete.

CLICK RULES — read carefully:
- DESKTOP icons (icons on the wallpaper/background area): ALWAYS double_click to open them.
- TASKBAR icons (pinned/running apps in the bar at the bottom): single left_click to open/switch.
- START MENU items (after pressing Win): single left_click.
- FILE EXPLORER files and folders: double_click to open.
- Buttons, links, checkboxes, input fields, menu items: single left_click.
- If you are unsure whether something is a desktop icon or taskbar, look at where it sits: desktop = wallpaper background; taskbar = the bar strip along an edge.

IMPORTANT USAGE PATTERNS:
- To open an app whose icon is on the DESKTOP: double_click the icon.
- To open an app via Start Menu: key('win'), type_text(app_name), wait(2), key('return').
- Before typing into any field, always left_click it first to focus it.
- Combine related actions in one step: left_click(field) + type_text('text') + key('return').
- Use wait() after app launches or page loads before taking further actions.
- In EVERY response write 1–3 sentences explaining what is on screen and what you are doing.
- On the FIRST step, ALWAYS call add_todo_item for each step in your plan first, then DO NOT call any other tool in that same step.
- EVERY todo item MUST include a screen position hint so future-you knows where to look. Examples:
  - "Click the Arc browser icon in the taskbar (bottom edge of screen)"
  - "Click the Start button (bottom-left corner)"
  - "Click the address bar (top of browser window, center)"
  - "Double-click the Recycle Bin icon (top-left area of desktop)"
- ORDER MATTERS: call add_todo_item in the EXACT order the steps must execute. The first add_todo_item call is step 1, the second is step 2, and so on. Bad example: pressing Enter listed BEFORE typing the URL. Good example for "go to example.com": (1) Click the address bar, (2) Type example.com, (3) Press Enter.
- When you execute a todo, RE-READ its position hint and click in that region — not where you guessed before.
- After the initial planning step, every step MUST include at least one non-todo tool call.
- Mark items done with complete_todo_item as soon as you can SEE they are done in the screenshot.

CRITICAL RULES:
- NEVER call task_done immediately after a motor action — wait for the next screenshot to verify.
- ONLY call task_done when you can SEE the confirmed result AND every todo item is marked done.
- Aim for the CENTER of elements when clicking.
- If the same action fails twice, try a different approach.
- Use Windows key (not cmd), ctrl (not cmd). This is Windows, not macOS.`

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
  left_click:   tool({ description: 'Single left-click at (x,y).', parameters: z.object(XY) }),
  double_click: tool({ description: 'Double left-click at (x,y). Use to open apps/files.', parameters: z.object(XY) }),
  right_click:  tool({ description: 'Right-click at (x,y) for context menus.', parameters: z.object(XY) }),
  hover:        tool({ description: 'Move mouse to (x,y) without clicking.', parameters: z.object(XY) }),
  drag: tool({
    description: 'Click-drag from (x1,y1) to (x2,y2).',
    parameters: z.object({
      x1: z.number().int().min(1).max(1000), y1: z.number().int().min(1).max(1000),
      x2: z.number().int().min(1).max(1000), y2: z.number().int().min(1).max(1000),
    }),
  }),
  scroll: tool({
    description: 'Scroll at (x,y). direction: up/down/left/right. amount: 1–10 steps.',
    parameters: z.object({
      x: z.number().int().min(1).max(1000), y: z.number().int().min(1).max(1000),
      direction: z.enum(['up', 'down', 'left', 'right']),
      amount: z.number().int().min(1).max(10),
    }),
  }),
  type_text: tool({ description: 'Type literal text. Focus the field first with left_click.', parameters: z.object({ text: z.string() }) }),
  key: tool({ description: 'Press a key or combo, e.g. "return", "ctrl+c", "win+e", "escape".', parameters: z.object({ key: z.string() }) }),
  wait: tool({ description: 'Wait N seconds for UI to load or animate.', parameters: z.object({ seconds: z.number().min(1).max(5) }) }),
  add_todo_item: tool({ description: 'Add a step to the todo list. Use on the first step to plan.', parameters: z.object({ text: z.string() }) }),
  complete_todo_item: tool({ description: 'Mark a todo item done by matching its text.', parameters: z.object({ text: z.string() }) }),
  task_done: tool({
    description: 'Signal the task is complete. All todo items must be marked done first.',
    parameters: z.object({ result: z.string().describe('What was accomplished'), success: z.boolean() }),
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
  let   planCreated        = false   // set to true once add_todo_item is called
  let   noProgressCount    = 0       // bail if too many empty iterations

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

    // ── 1. Grab latest frame ──────────────────────────────────────────────
    let frame: string | null = null
    for (let i = 0; i < 30 && !frame; i++) { frame = getLatestFrame(deviceId); if (!frame) await sleep(100) }
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

    // ── 3. Call VLM ───────────────────────────────────────────────────────
    // On the planning step, only expose add_todo_item so the model is FORCED
    // to plan first. After planCreated is true, expose all tools.
    const stepTools = planCreated
      ? TOOLS
      : { add_todo_item: TOOLS.add_todo_item }

    let result: Awaited<ReturnType<typeof generateText>>
    try {
      result = await generateText({
        model: ollamaProvider(MODEL, { parallelToolCalls: true } as any),
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image', image: Buffer.from(frame, 'base64'), mediaType: 'image/jpeg' as const },
          ],
        }],
        tools: stepTools,
        toolChoice: 'required',
        maxSteps: 1,
        temperature: 0.1,
        providerOptions: { openai: { think: true } },
      } as any)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      emit(deviceId, 'agent:error', { message: `VLM call failed: ${msg}` })
      return
    }

    // ── 4. Process tool calls ─────────────────────────────────────────────
    let calls = (result.toolCalls ?? []) as Array<{ toolName: string; input?: unknown; args?: unknown; toolCallId: string }>
    console.log(`[agent ${deviceId}] step ${step} planCreated=${planCreated} calls:`, calls.map(c => `${c.toolName}(${JSON.stringify(c.input ?? c.args ?? {}).slice(0, 60)})`).join(', '))
    if (!calls.length) {
      emit(deviceId, 'agent:error', { message: 'VLM returned no tool calls.' })
      return
    }

    // Server-side enforcement: qwen-vl ignores the `tools` restriction we send
    // and will call action tools even when we only expose add_todo_item.
    // On the planning step, drop any non-add_todo_item calls.
    if (!planCreated) {
      const filtered = calls.filter(c => c.toolName === 'add_todo_item')
      console.log(`[agent ${deviceId}] planning filter: kept ${filtered.length}/${calls.length} calls`)
      if (filtered.length === 0) {
        // Model called only action tools — ignore them all and warn.
        loopWarning = 'STOP. You called action tools, but you must first create a plan. Your action calls were ignored. Call add_todo_item to add each step of your plan now.'
        noProgressCount++
        if (noProgressCount >= 3) {
          emit(deviceId, 'agent:error', { message: 'Agent refused to create a plan after 3 attempts. Aborting.' })
          return
        }
        history.push('[blocked] tried to act before planning')
        continue
      }
      calls = filtered
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
        if (todoItems.length === 0) {
          loopWarning = 'CANNOT FINISH: you have not created a plan yet. Call add_todo_item to create your todo list first.'
          continue
        }
        const open = todoItems.filter(t => !t.done)
        if (open.length) {
          loopWarning = `CANNOT FINISH: ${open.length} todo item(s) still open: ${open.map(t => t.text).join('; ')}. Complete them first.`
          continue
        }
        taskDone    = true
        taskResult  = String(input.result ?? 'Done.')
        taskSuccess = Boolean(input.success ?? true)
        continue
      }

      // Action tool
      stepActions.push({ name, input })
    }

    if (todosChanged) emit(deviceId, 'agent:todo', { items: todoItems })

    // Planning step enforcement:
    // The model MUST call add_todo_item before taking any action.
    // Once planCreated is true, it can proceed with actions.
    if (todosChanged && !planCreated) {
      planCreated = true
      if (stepActions.length) {
        loopWarning = 'On the planning step you must ONLY create the plan — action calls were ignored. Now execute the plan step by step.'
      }
      history.push('[planning] Created todo list')
      noProgressCount = 0
      continue
    }


    // After planning: if model called only todo management tools (no actions),
    // just record and loop without executing anything.
    if (todosChanged && !stepActions.length && !taskDone) {
      history.push('[updated todo list]')
      noProgressCount = 0
      continue
    }

    // No-progress kill switch:
    // If neither todos changed nor actions executed nor task_done, the agent
    // is spinning. Allow 3 such iterations, then abort.
    if (!todosChanged && !stepActions.length && !taskDone) {
      noProgressCount++
      if (noProgressCount >= 3) {
        emit(deviceId, 'agent:error', { message: 'Agent made no progress for 3 consecutive steps. Aborting.' })
        return
      }
      loopWarning = `You made no progress this step. ${planCreated ? 'Call a real action tool (click, type, key, etc.).' : 'Call add_todo_item to create your plan.'}`
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

    // ── 8. Update text history ────────────────────────────────────────────
    const stepDesc = stepActions.map(a => toolDesc(a.name, a.input)).join(' + ')
    if (stepDesc) history.push(stepDesc)
    if (history.length > 30) history.splice(0, history.length - 30)
  }

  emit(deviceId, 'agent:error', { message: `Reached step limit (${MAX_STEPS}).` })
}
