import { useCallback, useRef, useState } from 'react';
import { API_BASE } from '../lib/constants';

export function useAgent(onItem) {
  const [running, setRunning] = useState(false);
  const sourceRef = useRef(null);
  const runTokenRef = useRef(0);

  const startAgent = useCallback(
    async (goal, options = {}) => {
      const nextToken = runTokenRef.current + 1;
      runTokenRef.current = nextToken;

      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }

      await fetch(`${API_BASE}/agent/stop`, { method: 'POST' }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 150));

      if (runTokenRef.current !== nextToken) {
        return;
      }

      setRunning(true);

      const params = new URLSearchParams({ q: goal });
      if (options.additionalInstructions) {
        params.set('instructions', options.additionalInstructions);
      }
      const url = `${API_BASE}/agent/action?${params.toString()}`;
      const source = new EventSource(url);

      source.onmessage = (event) => {
        if (runTokenRef.current !== nextToken) {
          source.close();
          return;
        }
        const data = JSON.parse(event.data);
        if (data.type === 'viz') {
          onItem({ kind: 'viz', payload: data.payload });
        } else if (data.type === 'done') {
          setRunning(false);
          source.close();
          if (sourceRef.current === source) {
            sourceRef.current = null;
          }
        } else if (data.type === 'error') {
          onItem({ kind: 'viz', payload: { kind: 'error', message: data.message } });
          setRunning(false);
          source.close();
          if (sourceRef.current === source) {
            sourceRef.current = null;
          }
        }
      };

      source.onerror = () => {
        source.close();
        if (runTokenRef.current === nextToken) {
          setRunning(false);
          if (sourceRef.current === source) {
            sourceRef.current = null;
          }
        }
      };

      sourceRef.current = source;
    },
    [onItem]
  );

  const stopAgent = useCallback(() => {
    runTokenRef.current += 1;
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    fetch(`${API_BASE}/agent/stop`, { method: 'POST' }).catch(() => {});
    setRunning(false);
  }, []);

  return { running, startAgent, stopAgent };
}
