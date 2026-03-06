'use client';

import { useRef, useEffect } from 'react';
import { Editor } from '@monaco-editor/react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  height?: string;
  minHeight?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Enter markdown content...',
  disabled = false,
  height = '300px',
  minHeight = '300px'
}: MarkdownEditorProps) {
  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // Configure for markdown
    monaco.languages.setMonarchTokensProvider('markdown', {
      tokenizer: {
        root: [
          [/^(#{1,6})\s/, 'header'],
          [/^\*\s/, 'list'],
          [/^-\s/, 'list'],
          [/^\d+\.\s/, 'list'],
          [/\*\*([^*]+)\*\*/, 'strong'],
          [/\*([^*]+)\*/, 'emphasis'],
          [/`([^`]+)`/, 'code.inline'],
          [/```[\s\S]*?```/, 'code.block'],
          [/\[([^\]]+)\]\(([^)]+)\)/, 'link'],
          [/!\[([^\]]*)\]\(([^)]+)\)/, 'image'],
        ],
      },
    });

    // Set up markdown theme
    monaco.editor.defineTheme('markdown-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'header', foreground: '89dceb', fontStyle: 'bold' },
        { token: 'strong', foreground: 'f9fafb', fontStyle: 'bold' },
        { token: 'emphasis', foreground: 'f9fafb', fontStyle: 'italic' },
        { token: 'code.inline', foreground: 'a5f3fc', background: '1e293b' },
        { token: 'code.block', foreground: 'a5f3fc', background: '1e293b' },
        { token: 'link', foreground: '7dd3fc' },
        { token: 'image', foreground: 'fbbf24' },
        { token: 'list', foreground: '34d399' },
      ],
      colors: {
        'editor.background': '#1e293b',
        'editor.foreground': '#f9fafb',
      },
    });

    monaco.editor.defineTheme('markdown-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'header', foreground: '0ea5e9', fontStyle: 'bold' },
        { token: 'strong', foreground: '111827', fontStyle: 'bold' },
        { token: 'emphasis', foreground: '111827', fontStyle: 'italic' },
        { token: 'code.inline', foreground: '0891b2', background: '#f0f9ff' },
        { token: 'code.block', foreground: '0891b2', background: '#f0f9ff' },
        { token: 'link', foreground: '0284c7' },
        { token: 'image', foreground: 'd97706' },
        { token: 'list', foreground: '059669' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#111827',
      },
    });

    // Set the language to markdown
    monaco.editor.setModelLanguage(editor.getModel(), 'plaintext');

    // Apply theme based on system preference
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    monaco.editor.setTheme(isDark ? 'markdown-dark' : 'markdown-light');

    // Listen for theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      monaco.editor.setTheme(e.matches ? 'markdown-dark' : 'markdown-light');
    };
    mediaQuery.addEventListener('change', handleChange);

    // Set up editor options for markdown
    editor.updateOptions({
      wordWrap: 'on',
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
      renderLineHighlight: 'none',
      occurrencesHighlight: false,
      renderValidationDecorations: 'on',
      quickSuggestions: false,
      parameterHints: { enabled: false },
      suggestOnTriggerCharacters: false,
      acceptSuggestionOnEnter: 'off',
      tabCompletion: 'off',
      wordBasedSuggestions: false,
    });

    // Cleanup listener
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Editor
        height={height}
        value={value}
        onChange={(val) => onChange(val || '')}
        onMount={handleEditorDidMount}
        language="plaintext"
        theme="vs-dark"
        options={{
          readOnly: disabled,
          placeholder: placeholder,
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
          lineNumbers: 'on',
          wordWrap: 'on',
          automaticLayout: true,
        }}
        loading={
          <div className="flex items-center justify-center h-32 text-zinc-500">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-500 mr-2"></div>
            Loading editor...
          </div>
        }
      />
    </div>
  );
}
