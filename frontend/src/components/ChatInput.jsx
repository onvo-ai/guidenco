import { useLayoutEffect, useRef } from 'react';
import { Send, Square } from 'lucide-react';

export default function ChatInput({ input, setInput, onSend, onStop, disabled, running }) {
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(60, el.scrollHeight)}px`;
  }, [input]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  const canSend = !disabled && input.trim();

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px 0 0', gap: 8 }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the agent to do something…"
          disabled={disabled}
          style={{
            flex: 1,
            minHeight: 60,
            padding: '14px 14px',
            border: 'none',
            background: 'transparent',
            color: 'rgba(255,255,255,0.88)',
            font: 'inherit',
            fontSize: 13,
            resize: 'none',
            overflow: 'hidden',
            outline: 'none',
            lineHeight: 1.45,
            boxSizing: 'border-box',
          }}
        />
        {running ? (
          <button
            onClick={onStop}
            style={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid rgba(255,80,80,0.4)',
              background: 'rgba(255,60,60,0.18)',
              color: 'rgba(255,120,120,0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            type="button"
            title="Stop agent"
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!canSend}
            style={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.1)',
              background: canSend ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
              color: canSend ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}
            type="button"
            title="Send"
          >
            <Send size={13} />
          </button>
        )}
      </div>
      <style>{`textarea::placeholder{color:rgba(255,255,255,0.22)}`}</style>
    </div>
  );
}
