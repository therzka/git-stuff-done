'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Link2, X } from 'lucide-react';
import TiptapEditor, { type TiptapEditorHandle } from './TiptapEditor';
import ImageLightbox from './ImageLightbox';
import { DEMO_LOG_CONTENT, DEMO_RICH_LOG_CONTENT } from '@/lib/demo';

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved';

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '', unsaved: 'Unsaved changes', saving: 'Saving...', saved: 'Saved ✓',
};
const STATUS_COLOR: Record<SaveStatus, string> = {
  idle: 'text-muted-foreground', unsaved: 'text-amber-500', saving: 'text-primary', saved: 'text-emerald-500',
};

interface RawWorkLogProps {
  date?: string;
  isDemo?: boolean;
  onRegisterInsert?: (fn: (text: string) => void) => void;
}

function getTodayLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

export default function RawWorkLog({ date, isDemo = false, onRegisterInsert }: RawWorkLogProps) {
  const currentDate = date ?? getTodayLocal();
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [linkifying, setLinkifying] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef(content);
  const editorRef = useRef<TiptapEditorHandle>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchLog() {
      if (isDemo) {
        setContent(DEMO_LOG_CONTENT);
        latestContentRef.current = DEMO_LOG_CONTENT;
        setStatus('idle');
        return;
      }
      const res = await fetch(`/api/log?date=${currentDate}`);
      const data = await res.json();
      if (!cancelled) {
        setContent(data.content);
        latestContentRef.current = data.content;
        setStatus('idle');
      }
    }
    fetchLog();
    return () => { cancelled = true; };
  }, [currentDate, isDemo]);

  // Fetch existing attachments for the current date
  useEffect(() => {
    if (isDemo) { setAttachments([]); return; }
    let cancelled = false;
    fetch(`/api/attachments?date=${currentDate}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setAttachments(d.files || []); })
      .catch(() => { if (!cancelled) setAttachments([]); });
    return () => { cancelled = true; };
  }, [currentDate, isDemo]);

  const save = useCallback(async (text: string) => {
    if (isDemo) return;
    setStatus('saving');
    try {
      await fetch('/api/log', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: currentDate, content: text }),
      });
      setStatus('saved');
    } catch {
      setStatus('unsaved');
    }
  }, [currentDate, isDemo]);

  const handleLinkify = async () => {
    setLinkifying(true);

    if (isDemo) {
      setTimeout(() => {
        setContent(DEMO_RICH_LOG_CONTENT);
        latestContentRef.current = DEMO_RICH_LOG_CONTENT;
        setLinkifying(false);
      }, 1500);
      return;
    }

    // Save first, then linkify
    await save(latestContentRef.current);
    try {
      const res = await fetch('/api/linkify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: currentDate }),
      });
      const data = await res.json();
      if (data.success && data.content) {
        setContent(data.content);
        latestContentRef.current = data.content;
        setStatus('saved');
      }
    } finally {
      setLinkifying(false);
    }
  };

  const scheduleAutosave = useCallback((text: string) => {
    setStatus('unsaved');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(text), 1000);
  }, [save]);

  const handleEditorUpdate = useCallback((markdown: string) => {
    latestContentRef.current = markdown;
    scheduleAutosave(markdown);
  }, [scheduleAutosave]);

  const handleImageUpload = useCallback(async (file: File): Promise<string> => {
    if (isDemo) throw new Error('Upload disabled in demo mode');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('date', currentDate);
    const res = await fetch('/api/attachments', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    setAttachments(prev => [...prev, data.url]);
    return data.url;
  }, [currentDate, isDemo]);

  const handleDeleteAttachment = useCallback(async (url: string) => {
    if (isDemo) return;
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) setAttachments(prev => prev.filter(u => u !== url));
    } catch { /* ignore */ }
  }, [isDemo]);

  const insertAtCursor = useCallback((text: string) => {
    editorRef.current?.insertAtCursor(text);
  }, []);

  useEffect(() => {
    onRegisterInsert?.(insertAtCursor);
  }, [onRegisterInsert, insertAtCursor]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-base font-semibold text-primary flex items-center gap-2">
          <FileText className="h-4 w-4" aria-hidden="true" />
          {currentDate}
        </span>
        <div className="flex items-center gap-2">
          {status !== 'idle' && (
            <span className={`text-xs font-medium ${STATUS_COLOR[status]}`}>
              {STATUS_LABEL[status]}
            </span>
          )}
          <button
            onClick={handleLinkify}
            disabled={linkifying || !content.trim()}
            title="Resolve GitHub links to their issue and PR titles"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground transition hover:opacity-80 disabled:opacity-40"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            {linkifying ? 'Linkifying…' : 'Linkify'}
          </button>
        </div>
      </div>
      <TiptapEditor
        ref={editorRef}
        content={content}
        onUpdate={handleEditorUpdate}
        placeholder="Start typing your work log..."
        onImageUpload={handleImageUpload}
      />
      {attachments.length > 0 && (
        <div className="shrink-0 border-t border-border px-3 py-2 flex items-center gap-2 flex-wrap">
          {attachments.map(url => (
            <div key={url} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-20 w-auto rounded-md border border-border cursor-pointer object-contain transition-opacity hover:opacity-75"
                onClick={() => setLightboxSrc(url)}
              />
              <button
                onClick={() => handleDeleteAttachment(url)}
                className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-colors hover:opacity-90"
                aria-label="Delete attachment"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
