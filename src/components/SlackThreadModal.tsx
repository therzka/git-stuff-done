'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';

interface SlackThreadModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  onInsert: (text: string) => void;
}

export default function SlackThreadModal({ isOpen, onClose, url, onInsert }: SlackThreadModalProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Create a read-only Tiptap editor to render the markdown as rich text
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
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
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({
        tightLists: true,
        linkify: true,
      }),
    ],
    content: '',
  });

  useEffect(() => {
    if (!isOpen || !url) return;
    let cancelled = false;
    setMarkdown(null);
    setError(null);
    setLoading(true);

    fetch(`/api/slack?url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          const md = data.markdown ?? '';
          setMarkdown(md);
          // Update the read-only editor with the markdown content
          if (editor) {
            editor.commands.setContent(md);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to fetch Slack thread.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, url, editor]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleInsert = () => {
    if (markdown) {
      onInsert(markdown);
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      style={{ zIndex: 9999 }}
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="bg-popover ring-1 ring-border rounded-2xl shadow-xl flex flex-col w-full max-w-2xl max-h-[90vh]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Slack icon */}
            <svg className="shrink-0 text-muted-foreground" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
            </svg>
            <span className="text-sm font-medium truncate text-foreground">Slack Thread</span>
            <span className="text-xs text-muted-foreground truncate hidden sm:block">{url}</span>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Fetching thread…
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive whitespace-pre-wrap font-mono bg-destructive/10 rounded p-3">
              {error}
            </div>
          )}
          {markdown !== null && !loading && editor && (
            <EditorContent 
              editor={editor} 
              className="tiptap-editor prose prose-sm dark:prose-invert max-w-none"
            />
          )}
        </div>

        {/* Footer */}
        {markdown !== null && !loading && !error && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              Insert into log
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
