import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../lib/constants';

/**
 * Subscribes to the global agent stream (/api/agent/stream) on mount and
 * keeps reconnecting on disconnect. This means the widget always reflects
 * live agent state, even when an external caller (e.g. the Claude skill)
 * triggers the agent.
 *
 * Job submission goes through POST /api/agent/queue rather than opening a
 * new EventSource, so multiple jobs are queued and run sequentially.
 */
export function useAgent(onItem, onGoalChange, onQueueStateChange) {
  const [running, setRunning] = useState(false);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      const source = new EventSource(`${API_BASE}/agent/stream`);

      source.onmessage = (event) => {
        if (!mountedRef.current) return;
        let data;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.type === 'start') {
          setRunning(true);
          onGoalChange?.(data.goal);
          onItem({ kind: 'clear' });
        } else if (data.type === 'viz') {
          const payload = data.payload || {};
          if (payload.kind === 'queue_state') {
            onQueueStateChange?.(payload);
            setRunning(!!payload.current);
          } else {
            onItem({ kind: 'viz', payload });
          }
        } else if (data.type === 'done') {
          setRunning(false);
        } else if (data.type === 'error') {
          onItem({ kind: 'viz', payload: { kind: 'error', message: data.message } });
          setRunning(false);
        }
      };

      source.onerror = () => {
        source.close();
        if (!mountedRef.current) return;
        reconnectTimer.current = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
    };
  }, []);

  const startAgent = useCallback(async (goal, options = {}) => {
    const body = new URLSearchParams({ q: goal });
    if (options.additionalInstructions) {
      body.set('instructions', options.additionalInstructions);
    }
    await fetch(`${API_BASE}/agent/queue`, { method: 'POST', body }).catch(() => {});
  }, []);

  const stopAgent = useCallback(() => {
    fetch(`${API_BASE}/agent/stop`, { method: 'POST' }).catch(() => {});
    setRunning(false);
  }, []);

  return { running, startAgent, stopAgent };
}
