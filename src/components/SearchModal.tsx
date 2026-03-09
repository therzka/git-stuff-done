'use client';

import { useEffect, useState, useRef } from 'react';
import { X, AlertTriangle, Search, ChevronDown, Check, Copy } from 'lucide-react';

const MODELS = [
  { label: 'GPT 5.2', value: 'gpt-5.2' },
  { label: 'GPT 4.1', value: 'gpt-4.1' },
  { label: 'Claude 4.6 Sonnet', value: 'claude-sonnet-4.6' },
];

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDemo?: boolean;
}

export default function SearchModal({ isOpen, onClose, isDemo = false }: SearchModalProps) {
  const DEMO_QUERY = 'when did I meet with sarah?';
  const DEMO_RESULT = "Based on your work logs, you last met with Sarah on **2026-02-27** (Thursday).\n\n**From that day's log:**\n- 1:1 with Sarah — discussed Q2 roadmap priorities and the upcoming analytics migration\n- Agreed to sync again after the design review next Wednesday\n\nBefore that, you also met on **2026-02-13** for sprint planning.";

  const [query, setQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [daysSearched, setDaysSearched] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const [searchMode, setSearchMode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const demoInitRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && isDemo && !demoInitRef.current) {
      demoInitRef.current = true;
      setQuery(DEMO_QUERY);
      setResult(DEMO_RESULT);
      setDaysSearched(7);
    }
    if (!isOpen) {
      demoInitRef.current = false;
    }
  }, [isOpen, isDemo]);

  if (!isOpen) return null;

  function todayISO() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

  const handleSearch = async (offsetDays = 0) => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setCanContinue(false);
    setStatusMessage(null);
    if (offsetDays === 0) {
      setResult(null);
      setDaysSearched(0);
      setExhausted(false);
      setSearchMode(null);
    }

    if (isDemo) {
      setTimeout(() => {
        setResult("## Demo Search Result\n\nThis is a simulated search result. In a real environment, this would search through your work logs using AI.\n\n**Found in logs from 2026-03-01:**\n- Worked on authentication refactor\n- Fixed CI pipeline issues");
        setDaysSearched(7);
        setLoading(false);
      }, 1500);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          model: selectedModel,
          todayDate: todayISO(),
          offsetDays,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error('Search failed');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            if (event.type === 'progress') {
              setStatusMessage(event.message);
              if (event.daysSearched != null) setDaysSearched(event.daysSearched);
              if (event.searchMode) setSearchMode(event.searchMode);
            } else if (event.type === 'complete') {
              setDaysSearched(event.daysSearched);
              setExhausted(event.exhausted);
              setSearchMode(event.searchMode ?? null);
              if (event.answer) {
                setResult(event.answer);
                setCanContinue(false);
              } else {
                setCanContinue(event.searchMode === 'recent_first' && !event.exhausted);
                setResult(null);
              }
            } else if (event.type === 'error') {
              setError(event.error || 'An error occurred while searching.');
            }
          } catch {
            // Ignore malformed JSON lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('An error occurred while searching. Please try again.');
      }
    } finally {
      setStatusMessage(null);
      setLoading(false);
    }
  };

  const handleClose = () => {
    abortRef.current?.abort();
    setQuery('');
    setResult(null);
    setError(null);
    setDaysSearched(0);
    setExhausted(false);
    setCanContinue(false);
    setSearchMode(null);
    setStatusMessage(null);
    setLoading(false);
    onClose();
  };

  const showLongSearchWarning = daysSearched > 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onMouseDown={(e) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) handleClose(); }}>
      <div ref={panelRef} className="w-full max-w-2xl rounded-2xl bg-popover shadow-xl ring-1 ring-border max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-popover sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-popover-foreground">Search Work Logs</h2>
          <button onClick={handleClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Query input */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Question</label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !loading) {
                  e.preventDefault();
                  handleSearch(0);
                }
              }}
              className="w-full h-20 rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 resize-none transition-all"
              placeholder="Ask a question about your work logs... (e.g. &quot;What did I work on last week?&quot;)"
              disabled={loading}
            />
          </div>

          {/* Model selector */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">AI Model</label>
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={loading}
                className="w-full appearance-none rounded-xl border border-input bg-muted/50 pl-3 pr-9 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>

          {/* Loading / Progress */}
          {loading && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">
                {statusMessage || 'Starting search...'}
              </span>
            </div>
          )}

          {/* Long search warning */}
          {showLongSearchWarning && !exhausted && (
            <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 p-3 rounded-xl border border-amber-100 dark:border-amber-900/50 flex items-center gap-2">
              <span>⏳</span> Searching far back in history — this may take a while.
            </div>
          )}

          {/* Continue searching prompt */}
          {canContinue && !loading && (
            <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
              <p className="text-sm text-muted-foreground">
                Searched the last {daysSearched} days but couldn&apos;t find a clear answer. Want to keep looking further back?
              </p>
              <button
                onClick={() => handleSearch(daysSearched)}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-80"
              >
                Keep Searching
              </button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="mt-2 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">Answer</label>
                <span className="text-[10px] text-muted-foreground">
                  Searched {daysSearched} days
                </span>
              </div>
              <div className="rounded-xl border border-input bg-muted px-4 py-3 text-sm text-foreground whitespace-pre-wrap font-mono">
                {result}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 p-4 rounded-xl border border-red-100 dark:border-red-900/50 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-between items-center bg-popover sticky bottom-0 z-10">
          <div className="flex gap-2">
            {result && (
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result);
                    setCopied(true);
                    setTimeout(() => { if (mountedRef.current) setCopied(false); }, 2000);
                  } catch { /* clipboard not available */ }
                }}
                className={`rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-all ${copied ? 'text-emerald-500 border border-emerald-500/30 bg-emerald-500/10' : 'text-muted-foreground border border-border bg-muted/50 hover:bg-muted hover:shadow-sm'}`}
              >
                {copied ? <><Check className="h-3.5 w-3.5" aria-hidden="true" />Copied!</> : <><Copy className="h-3.5 w-3.5" aria-hidden="true" />Copy</>}
              </button>
            )}
          </div>
          <button
            onClick={() => handleSearch(0)}
            disabled={loading || !query.trim()}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching…' : <><Search className="h-3.5 w-3.5 inline-block mr-1.5" aria-hidden="true" />Search</>}
          </button>
        </div>
      </div>
    </div>
  );
}
