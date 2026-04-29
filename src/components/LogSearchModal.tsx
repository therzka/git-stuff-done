'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, CalendarDays, Loader2 } from 'lucide-react';

interface LogSearchResult {
  date: string;
  excerpts: string[];
}

interface LogSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (date: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Wrap matching query term in <mark> tags for highlighting. */
function highlightQuery(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escapedQuery})`, 'gi');
  return escaped.replace(re, '<mark class="bg-yellow-200 dark:bg-yellow-800/60 text-foreground rounded px-0.5">$1</mark>');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function LogSearchModal({ isOpen, onClose, onNavigate }: LogSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LogSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Reset state on close
      setQuery('');
      setResults([]);
      setError(null);
      setSearched(false);
      setLoading(false);
      abortRef.current?.abort();
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/log/search?q=${encodeURIComponent(q.trim())}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Search failed');
      }
      const data = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 300);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      runSearch(query);
    }
  }

  if (!isOpen) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center pt-[10vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl mx-4 rounded-2xl border border-border bg-popover shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            placeholder="Search your work logs…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" aria-hidden="true" />}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 p-2">
          {error && (
            <p className="px-3 py-4 text-sm text-destructive text-center">{error}</p>
          )}

          {!error && searched && !loading && results.length === 0 && (
            <p className="px-3 py-8 text-sm text-muted-foreground text-center">
              No log entries found for <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span>
            </p>
          )}

          {!error && !searched && !loading && (
            <p className="px-3 py-8 text-sm text-muted-foreground text-center">
              Type to search across all your work log entries
            </p>
          )}

          {results.map(({ date, excerpts }) => (
            <div key={date} className="rounded-xl border border-border bg-card mb-2 last:mb-0 overflow-hidden">
              {/* Date row */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="text-xs font-semibold text-foreground">{formatDate(date)}</span>
                </div>
                <button
                  onClick={() => onNavigate(date)}
                  className="text-xs text-accent-foreground font-medium hover:underline transition-colors shrink-0"
                >
                  Go to date →
                </button>
              </div>

              {/* Excerpt(s) */}
              <div className="divide-y divide-border/50">
                {excerpts.map((excerpt, i) => (
                  <p
                    key={i}
                    className="px-4 py-2.5 text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono"
                    // Safe: only the query term is injected as a regex replacement; log content is HTML-escaped first
                    dangerouslySetInnerHTML={{ __html: highlightQuery(excerpt, query) }}
                  />
                ))}
              </div>
            </div>
          ))}

          {results.length > 0 && (
            <p className="text-center text-[10px] text-muted-foreground py-2">
              {results.length} day{results.length !== 1 ? 's' : ''} matched
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
}
