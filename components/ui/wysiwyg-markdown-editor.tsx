'use client';

import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  toolbarPlugin,
  BlockTypeSelect,
  CreateLink,
  InsertTable,
  ListsToggle,
  Separator,
  InsertThematicBreak
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import './mdx-editor-styles.module.css';

interface WysiwygMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  height?: string;
}

export function WysiwygMarkdownEditor({
  value,
  onChange,
  placeholder = "Start typing...",
  disabled = false,
  height = "400px"
}: WysiwygMarkdownEditorProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div style={{ height }} className="relative">
        <MDXEditor
          markdown={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={disabled}
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            markdownShortcutPlugin(),
            linkPlugin(),
            linkDialogPlugin(),
            imagePlugin(),
            tablePlugin(),
            codeBlockPlugin(),
            codeMirrorPlugin(),
            toolbarPlugin({
              toolbarContents: () => (
                <>
                  <UndoRedo />
                  <Separator />
                  <BlockTypeSelect />
                  <Separator />
                  <BoldItalicUnderlineToggles />
                  <Separator />
                  <ListsToggle />
                  <Separator />
                  <CreateLink />
                  <Separator />
                  <InsertTable />
                  <Separator />
                  <InsertThematicBreak />
                </>
              )
            })
          ]}
          contentEditableClassName="prose prose-zinc dark:prose-invert max-w-none p-6 focus:outline-none min-h-full [&_*]:mb-4 [&_p]:mb-4 [&_h1]:mb-4 [&_h2]:mb-4 [&_h3]:mb-4 [&_h4]:mb-4 [&_h5]:mb-4 [&_h6]:mb-4 [&_ul]:mb-4 [&_ol]:mb-4 [&_pre]:mb-4 [&_blockquote]:mb-4"
          className="bg-white dark:bg-zinc-900"
        />
      </div>
    </div>
  );
}
