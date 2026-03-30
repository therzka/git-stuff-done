'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';
import { Plugin } from '@tiptap/pm/state';
import { useEffect, useImperativeHandle, forwardRef, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SLACK_URL_RE = /^https?:\/\/[^/]*\.slack\.com\/archives\//;

// Inserts a trailing space after any paste so the cursor escapes the link node.
const TrailingSpaceAfterPaste = Extension.create({
  name: 'trailingSpaceAfterPaste',
  addProseMirrorPlugins() {
    const ext = this;
    return [
      new Plugin({
        props: {
          handlePaste: () => {
            setTimeout(() => {
              ext.editor.chain().focus().insertContent(' ').run();
            }, 0);
            return false;
          },
        },
      }),
    ];
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMarkdown(editor: { storage: any }): string {
  return editor.storage.markdown.getMarkdown();
}

export interface TiptapEditorHandle {
  insertAtCursor: (text: string) => void;
}

interface TiptapEditorProps {
  content: string;
  onUpdate: (markdown: string) => void;
  placeholder?: string;
  onSlackLinkClick?: (url: string) => void;
}

const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  ({ content, onUpdate, placeholder, onSlackLinkClick }, ref) => {
    const onUpdateRef = useRef(onUpdate);
    useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
    // Track whether we're doing an external content reset to avoid echoing it back
    const externalUpdateRef = useRef(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const onSlackLinkClickRef = useRef(onSlackLinkClick);
    useEffect(() => { onSlackLinkClickRef.current = onSlackLinkClick; }, [onSlackLinkClick]);
    const [slackPeek, setSlackPeek] = useState<{ url: string; top: number; left: number } | null>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Link.configure({
          openOnClick: true,
          autolink: true,
          HTMLAttributes: {
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        }),
        Placeholder.configure({
          placeholder: placeholder ?? 'Start typing...',
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Markdown.configure({
          tightLists: true,
          linkify: true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
        TrailingSpaceAfterPaste,
      ],
      content,
      onUpdate: ({ editor }) => {
        if (externalUpdateRef.current) return;
        const md = getMarkdown(editor);
        onUpdateRef.current(md);
      },
    });

    // Update editor when content prop changes externally (initial load, linkify)
    useEffect(() => {
      if (!editor) return;
      const currentMd = getMarkdown(editor);
      if (content !== currentMd) {
        externalUpdateRef.current = true;
        editor.commands.setContent(content);
        externalUpdateRef.current = false;
      }
    }, [content, editor]);

    useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) => {
        if (!editor) return;
        const textWithSpace = /\s$/.test(text) ? text : text + ' ';
        editor.chain().focus().insertContent(textWithSpace).run();
      },
    }), [editor]);

    // Show a peek button when hovering over Slack permalink links in the editor.
    useEffect(() => {
      if (!onSlackLinkClickRef.current) return;
      const container = containerRef.current;
      if (!container) return;

      const handleMouseOver = (e: MouseEvent) => {
        const link = (e.target as HTMLElement).closest('a');
        if (!link) return;
        const href = link.getAttribute('href') || '';
        if (!SLACK_URL_RE.test(href)) return;
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        const rect = link.getBoundingClientRect();
        setSlackPeek({ url: href, top: rect.top, left: rect.right + 4 });
      };

      const handleMouseOut = (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('a')) {
          hideTimerRef.current = setTimeout(() => setSlackPeek(null), 300);
        }
      };

      container.addEventListener('mouseover', handleMouseOver);
      container.addEventListener('mouseout', handleMouseOut);
      return () => {
        container.removeEventListener('mouseover', handleMouseOver);
        container.removeEventListener('mouseout', handleMouseOut);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      };
    }, []);

    return (
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
        <EditorContent
          editor={editor}
          className="tiptap-editor flex-1 w-full overflow-auto"
        />
        {slackPeek && onSlackLinkClick && createPortal(
          <button
            style={{ position: 'fixed', top: slackPeek.top - 2, left: slackPeek.left, zIndex: 9999 }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm transition-colors"
            onMouseEnter={() => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }}
            onMouseLeave={() => { hideTimerRef.current = setTimeout(() => setSlackPeek(null), 150); }}
            onClick={() => { onSlackLinkClick(slackPeek.url); setSlackPeek(null); }}
            title="View Slack thread"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
            </svg>
            View thread
          </button>,
          document.body,
        )}
      </div>
    );
  }
);

TiptapEditor.displayName = 'TiptapEditor';
export default TiptapEditor;
