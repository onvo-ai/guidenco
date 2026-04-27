import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import ToolBubble from './ToolBubble.jsx';

// ── styles ────────────────────────────────────────────────────────────────────

const textStyle = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: 13,
  color: 'rgba(255,255,255,0.82)',
  lineHeight: 1.45,
};

const mdComponents = {
  p:      ({ children }) => <p style={{ margin: '0 0 6px 0' }}>{children}</p>,
  strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{children}</strong>,
  em:     ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
  ul:     ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
  ol:     ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ol>,
  li:     ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
  h1:     ({ children }) => <p style={{ fontWeight: 700, fontSize: 14, margin: '6px 0 4px' }}>{children}</p>,
  h2:     ({ children }) => <p style={{ fontWeight: 700, fontSize: 13, margin: '6px 0 4px' }}>{children}</p>,
  h3:     ({ children }) => <p style={{ fontWeight: 600, margin: '4px 0 2px' }}>{children}</p>,
  code:   ({ children }) => <code style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3 }}>{children}</code>,
};

// ── tool args normaliser (unchanged logic) ────────────────────────────────────

function normaliseTool(tc) {
  const a = tc.arguments || {};
  const t = { type: tc.name };
  if (a.x  !== undefined) t.x = a.x;
  if (a.y  !== undefined) t.y = a.y;
  if (a.x1 !== undefined || a.x2 !== undefined || a.y1 !== undefined) {
    const x1v = a.x1, y1v = a.y1, x2v = a.x2, y2v = a.y2;
    if (Array.isArray(x1v) && x1v.length >= 4)                                        { [t.x1, t.y1, t.x2, t.y2] = x1v; }
    else if (Array.isArray(x1v) && x1v.length >= 2 && Array.isArray(x2v) && x2v.length >= 2) { [t.x1, t.y1] = x1v; [t.x2, t.y2] = x2v; }
    else if (Array.isArray(x1v) && x1v.length >= 2 && Array.isArray(y1v) && y1v.length >= 2) { [t.x1, t.y1] = x1v; [t.x2, t.y2] = y1v; }
    else if (Array.isArray(x1v) && x1v.length >= 2)                                   { [t.x1, t.y1] = x1v; t.x2 = x2v; t.y2 = y2v; }
    else                                                                                { t.x1 = x1v; t.y1 = y1v; t.x2 = x2v; t.y2 = y2v; }
  }
  if (a.text    !== undefined) t.text    = a.text;
  if (a.key     !== undefined) t.key     = a.key;
  if (a.amount  !== undefined) t.amount  = a.amount;
  if (a.seconds !== undefined) t.seconds = a.seconds;
  if (a.query   !== undefined) t.query   = a.query;
  if (a.max_results !== undefined) t.max_results = a.max_results;
  if (a.result  !== undefined) t.result  = a.result;
  if (a.success !== undefined) t.success = a.success;
  return t;
}

// ── collapsible row ───────────────────────────────────────────────────────────

function CollapseRow({ label, preview, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', padding: '3px 0',
          cursor: 'pointer', width: '100%', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        {!open && preview && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginLeft: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}>
            {preview}
          </span>
        )}
      </button>
      {open && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

// ── step bubble ───────────────────────────────────────────────────────────────

function StepBubble({ step }) {
  const { image, thinking, toolCalls, text, taskResult, todoState } = step;
  const accent = taskResult
    ? (taskResult.payload.success ? '#16a34a' : '#dc2626')
    : '#6b7280';
  const screenshotUrl = image?.payload?.url;
  const visibleTools = (toolCalls?.payload?.tool_calls || []).map(normaliseTool);

  // Merge native reasoning + model text into one "thinking" block
  const thinkingContent = [
    thinking?.payload?.content,
    text?.payload?.content,
  ].filter(Boolean).join('\n\n');

  const thinkingPreview = thinkingContent.slice(0, 80).replace(/\n/g, ' ');

  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* screenshot — collapsed, capped height so content below stays reachable */}
        {image && (
          <CollapseRow label="Screenshot">
            <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 6 }}>
              {screenshotUrl ? (
                <img
                  src={`${screenshotUrl}?t=${Date.now()}`}
                  alt="screenshot"
                  style={{ width: '100%', display: 'block' }}
                />
              ) : null}
            </div>
          </CollapseRow>
        )}

        {/* thinking — collapsed, merges reasoning_content + text */}
        {thinkingContent && (
          <CollapseRow label="Thinking" preview={thinkingPreview}>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
              <Markdown components={mdComponents}>{thinkingContent}</Markdown>
            </div>
          </CollapseRow>
        )}

        {/* tool calls — always visible */}
        {visibleTools.length > 0 && (
          <ToolBubble tools={visibleTools} />
        )}

        {todoState && (
          <TodoStepCard items={todoState.payload.items || []} />
        )}

      </div>
    </div>
  );
}

function TodoStepCard({ items }) {
  const completed = items.filter((item) => item?.done).length;
  const remaining = Math.max(0, items.length - completed);
  return (
    <div style={todoStepCardStyle}>
      <div style={todoStepHeaderStyle}>Todo Updated</div>
      <div style={todoStepSummaryStyle}>{completed} completed, {remaining} left</div>
      <div style={todoStepListStyle}>
        {items.map((item, index) => (
          <div key={`${index}-${item.text}`} style={todoStepRowStyle}>
            <span style={item.done ? todoStepDoneMarkStyle : todoStepOpenMarkStyle}>
              {item.done ? '✓' : '•'}
            </span>
            <span style={item.done ? todoStepDoneTextStyle : todoStepTextStyle}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── group flat items into steps ───────────────────────────────────────────────

function groupItems(items) {
  const result = [];
  let step = null;
  let stepNum = 0;

  const hasVisibleContent = (value) => {
    if (!value) return false;
    return Boolean(value.image || value.thinking || value.text || value.taskResult || value.todoState ||
      (value.toolCalls?.payload?.tool_calls || []).length > 0);
  };

  for (const item of items) {
    if (item.kind === 'user') {
      if (step) { result.push(step); step = null; }
      result.push(item);
      continue;
    }
    if (item.kind !== 'viz') continue;

    const k = item.payload.kind;

    if (k === 'prompt_image') {
      if (step && hasVisibleContent(step)) result.push(step);
      stepNum++;
      step = { type: 'step', id: item.id, stepNum, image: item, thinking: null, toolCalls: null, text: null, taskResult: null, todoState: null };
    } else if (step) {
      if (k === 'thinking') {
        step.thinking = step.thinking ? { ...item, payload: { content: [step.thinking.payload.content, item.payload.content].filter(Boolean).join('\n\n') } } : item;
      }
      if (k === 'tool_calls') {
        step.toolCallsList = step.toolCallsList || [];
        step.toolCallsList.push(item);
        const allCalls = step.toolCallsList.flatMap(tc => tc.payload?.tool_calls || []);
        step.toolCalls = { ...item, payload: { ...item.payload, tool_calls: allCalls } };
      }
      if (k === 'text') {
        step.text = step.text ? { ...item, payload: { content: [step.text.payload.content, item.payload.content].filter(Boolean).join('\n\n') } } : item;
      }
      if (k === 'todo_state') step.todoState = item;
      if (k === 'task_result') {
        step.taskResult = item;
        if (item.payload?.success) {
          if (hasVisibleContent(step)) result.push(step);
          step = null;
        }
      }
    } else {
      // before first screenshot (e.g. error)
      result.push(item);
    }
  }
  if (step) result.push(step);
  return result;
}

// ── main feed ─────────────────────────────────────────────────────────────────

export default function ChatFeed({ items }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const groups = groupItems(items);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.18)', fontSize: 12, padding: '12px 16px' }}>
          Start a chat to see agent reasoning here.
        </div>
      ) : groups.map(g => {
        if (g.type === 'step') return <StepBubble key={g.id} step={g} />;
        if (g.kind === 'user') return (
          <div key={g.id} style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 10px' }}>
            <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 14, borderBottomRightRadius: 4, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.45 }}>
              {g.payload.text}
            </div>
          </div>
        );
        if (g.kind === 'viz' && g.payload.kind === 'error') return <div key={g.id} style={{ ...textStyle, color: '#f87171', padding: '6px 10px' }}>{g.payload.message}</div>;
        return null;
      })}
    </div>
  );
}

const todoStepCardStyle = {
  border: '1px solid rgba(74,222,128,0.15)',
  background: 'rgba(22,163,74,0.08)',
  borderRadius: 8,
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const todoStepHeaderStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: '#4ade80',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const todoStepSummaryStyle = {
  fontSize: 12,
  color: 'rgba(74,222,128,0.7)',
};

const todoStepListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const todoStepRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
};

const todoStepTextStyle = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.7)',
  lineHeight: 1.4,
};

const todoStepDoneTextStyle = {
  ...todoStepTextStyle,
  color: 'rgba(255,255,255,0.3)',
  textDecoration: 'line-through',
};

const todoStepOpenMarkStyle = {
  color: '#4ade80',
  fontSize: 16,
  lineHeight: 1,
};

const todoStepDoneMarkStyle = {
  color: '#4ade80',
  fontSize: 13,
  lineHeight: 1.2,
  marginTop: 1,
};
