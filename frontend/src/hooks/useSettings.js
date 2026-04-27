import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'guidenco-settings';

const DEFAULTS = {
  additionalInstructions: '',
  llmProvider: 'ollama',
  llmModel: 'qwen3-vl:235b-instruct-cloud',
};

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULTS, ...JSON.parse(saved) };
      }
    } catch { /* ignore */ }
    return { ...DEFAULTS };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch { /* ignore */ }
  }, [settings]);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULTS });
  }, []);

  return { settings, updateSettings, resetSettings };
}