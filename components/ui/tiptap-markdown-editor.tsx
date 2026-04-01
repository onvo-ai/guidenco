'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Button } from '@/components/ui/button';

interface TiptapMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  height?: string;
}

function ToolbarButton({
  label,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-8 px-2 text-xs"
    >
      {label}
    </Button>
  );
}

export function TiptapMarkdownEditor({
  value,
  onChange,
  placeholder = 'Start typing...',
  disabled = false,
  height = '400px',
}: TiptapMarkdownEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit,
      Markdown.configure({
        markedOptions: {
          gfm: true,
        },
      }),
    ],
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class:
          'prose prose-zinc dark:prose-invert max-w-none min-h-full p-4 focus:outline-none',
      },
    },
    onUpdate: ({ editor }: { editor: Editor }) => {
      onChange(editor.getMarkdown());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const currentMarkdown = editor.getMarkdown();
    if (currentMarkdown === value) return;
    editor.commands.setContent(value, { contentType: 'markdown' });
  }, [editor, value]);

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <div className="border-b p-2 flex flex-wrap gap-2">
        <ToolbarButton
          label="Bold"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={disabled || !editor}
          active={editor?.isActive('bold') ?? false}
        />
        <ToolbarButton
          label="Italic"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={disabled || !editor}
          active={editor?.isActive('italic') ?? false}
        />
        <ToolbarButton
          label="H2"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={disabled || !editor}
          active={editor?.isActive('heading', { level: 2 }) ?? false}
        />
        <ToolbarButton
          label="Bullet List"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={disabled || !editor}
          active={editor?.isActive('bulletList') ?? false}
        />
        <ToolbarButton
          label="Ordered List"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={disabled || !editor}
          active={editor?.isActive('orderedList') ?? false}
        />
        <ToolbarButton
          label="Code"
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          disabled={disabled || !editor}
          active={editor?.isActive('codeBlock') ?? false}
        />
        <ToolbarButton
          label="Quote"
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={disabled || !editor}
          active={editor?.isActive('blockquote') ?? false}
        />
      </div>
      <div style={{ height }} className="overflow-y-auto">
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="p-4 text-sm text-zinc-500">{placeholder}</div>
        )}
      </div>
    </div>
  );
}
