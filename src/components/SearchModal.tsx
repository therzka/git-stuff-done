'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Search,
  CalendarDays,
  Loader2,
  Square,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { useModels } from '@/hooks/useModels';
import MarkdownViewer from '@/components/MarkdownViewer';
import { DEMO_SEARCH_QUERY, DEMO_SEARCH_RESULT } from '@/lib/demo';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (date: string) => void;
  defaultDate: string;
  isDemo?: boolean;
}

interface LogSearchResult {
  date: string;
  excerpts: string[];
}

type SearchMode = 'text' | 'ai' | 'ai-keywords';

const SEARCH_PRESETS = [
  { label: 'What did I work on?', value: 'What did I work on last week?' },
  { label: 'Blockers?', value: 'What blockers or issues did I run into?' },
  { label: 'What PRs?', value: 'What pull requests did I open or review?' },
  { label: 'AI usage?', value: 'How did I use AI tools recently?' },
  { label: 'Custom ✏️', value: '' },
] as const;

const INPUT_CLASSES =
  'rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all';
const PRIMARY_BUTTON_CLASSES =
  'rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const STOP_BUTTON_CLASSES =
  'rounded-xl bg-destructive px-6 py-2.5 text-sm font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50';
const MUTED_BUTTON_CLASSES =
  'rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:shadow-sm border border-transparent hover:border-border transition-all disabled:opacity-50 disabled:cursor-not-allowed';

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function highlightQuery(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escapedQuery})`, 'gi');
  return escaped.replace(
    re,
    '<mark class="bg-gradient-to-r from-violet-300 to-pink-300 dark:from-violet-500/50 dark:to-pink-500/50 text-foreground rounded px-0.5 font-semibold">$1</mark>',
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function dateDiffInDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / 86400000) + 1);
}

export default function SearchModal({
  isOpen,
  onClose,
  onNavigate,
  defaultDate,
  isDemo = false,
}: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('text');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(defaultDate);

  const [textResults, setTextResults] = useState<LogSearchResult[]>([]);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [textSearched, setTextSearched] = useState(false);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [daysSearched, setDaysSearched] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const [searchMode, setSearchMode] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [savingSearch, setSavingSearch] = useState(false);
  const [searchSaveMessage, setSearchSaveMessage] = useState<string | null>(null);
  const [showNoAnswerTips, setShowNoAnswerTips] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textAbortRef = useRef<AbortController | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const demoInitRef = useRef(false);

  const aiEnabled = isOpen && mode !== 'text';
  const { models, loading: modelsLoading } = useModels(aiEnabled);
  const [selectedModel, setSelectedModel] = useState('');

  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  const anyLoading = textLoading || searchLoading;
  const isAiMode = mode !== 'text';
  const showLongSearchWarning = daysSearched > 60;
  const activeDateRange = dateRangeOpen && Boolean(fromDate) && Boolean(toDate);

  const resetState = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    textAbortRef.current?.abort();
    aiAbortRef.current?.abort();
    textAbortRef.current = null;
    aiAbortRef.current = null;
    setQuery('');
    setMode('text');
    setSelectedPreset(null);
    setDateRangeOpen(false);
    setFromDate('');
    setToDate(defaultDate);
    setTextResults([]);
    setTextLoading(false);
    setTextError(null);
    setTextSearched(false);
    setSearchLoading(false);
    setSearchResult(null);
    setSearchError(null);
    setDaysSearched(0);
    setExhausted(false);
    setCanContinue(false);
    setSearchMode(null);
    setProgressMessage(null);
    setSavingSearch(false);
    setSearchSaveMessage(null);
    setShowNoAnswerTips(false);
  }, [defaultDate]);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  useEffect(() => {
    if (!isOpen) {
      demoInitRef.current = false;
      resetState();
      return;
    }

    if (isDemo && !demoInitRef.current) {
      demoInitRef.current = true;
      setQuery(DEMO_SEARCH_QUERY);
      setSearchResult(DEMO_SEARCH_RESULT);
      setDaysSearched(7);
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isDemo, isOpen, resetState]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleClose, isOpen]);

  useEffect(() => {
    if (!dateRangeOpen) return;
    setFromDate((current) => current || daysAgoISO(7));
    setToDate((current) => current || defaultDate);
  }, [dateRangeOpen, defaultDate]);

  const runTextSearch = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();

      if (!trimmed) {
        textAbortRef.current?.abort();
        setTextResults([]);
        setTextError(null);
        setTextSearched(false);
        setTextLoading(false);
        return;
      }

      if (isDemo) {
        setTextLoading(true);
        setTextError(null);
        window.setTimeout(() => {
          setTextResults([
            {
              date: defaultDate,
              excerpts: [DEMO_SEARCH_RESULT],
            },
          ]);
          setTextSearched(true);
          setTextLoading(false);
        }, 150);
        return;
      }

      textAbortRef.current?.abort();
      const controller = new AbortController();
      textAbortRef.current = controller;

      setTextLoading(true);
      setTextError(null);

      try {
        const params = new URLSearchParams({ q: trimmed });
        if (activeDateRange) {
          params.set('from', fromDate);
          params.set('to', toDate);
        }
        const res = await fetch(`/api/log/search?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Search failed');
        }

        const data = await res.json();
        setTextResults(data.results ?? []);
        setTextSearched(true);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setTextError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setTextLoading(false);
      }
    },
    [activeDateRange, defaultDate, fromDate, isDemo, toDate],
  );

  useEffect(() => {
    if (!isOpen || mode !== 'text') return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runTextSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [dateRangeOpen, fromDate, isOpen, mode, query, runTextSearch, toDate]);

  const handleAiSearch = useCallback(
    async (offsetDays = 0) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      setSearchLoading(true);
      setSearchError(null);
      setSearchSaveMessage(null);
      setCanContinue(false);
      setProgressMessage(null);
      setShowNoAnswerTips(false);

      if (offsetDays === 0) {
        setSearchResult(null);
        setDaysSearched(0);
        setExhausted(false);
        setSearchMode(null);
      }

      if (isDemo) {
        window.setTimeout(() => {
          setSearchResult(DEMO_SEARCH_RESULT);
          setDaysSearched(activeDateRange ? dateDiffInDays(fromDate, toDate) : 7);
          setSearchLoading(false);
        }, 1500);
        return;
      }

      aiAbortRef.current?.abort();
      const controller = new AbortController();
      aiAbortRef.current = controller;

      try {
        const body: {
          query: string;
          model: string;
          todayDate: string;
          offsetDays: number;
          startDate?: string;
          endDate?: string;
          useKeywordPrefilter?: true;
        } = {
          query: trimmed,
          model: selectedModel,
          todayDate: todayISO(),
          offsetDays,
        };

        if (mode === 'ai-keywords') {
          body.useKeywordPrefilter = true;
        }

        if (activeDateRange) {
          body.startDate = fromDate;
          body.endDate = toDate;
        }

        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error('Search failed');
        if (!res.body) throw new Error('Missing response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            try {
              const event = JSON.parse(trimmedLine) as {
                type: 'progress' | 'complete' | 'error';
                message?: string;
                daysSearched?: number;
                searchMode?: string;
                answer?: string | null;
                exhausted?: boolean;
                error?: string;
              };

              if (event.type === 'progress') {
                setProgressMessage(event.message ?? null);
                if (event.daysSearched != null) setDaysSearched(event.daysSearched);
                if (event.searchMode) setSearchMode(event.searchMode);
              } else if (event.type === 'complete') {
                setDaysSearched(event.daysSearched ?? 0);
                setExhausted(Boolean(event.exhausted));
                setSearchMode(event.searchMode ?? null);
                if (event.answer) {
                  setSearchResult(event.answer);
                  setCanContinue(false);
                } else {
                  setCanContinue(event.searchMode === 'recent_first' && !event.exhausted);
                  setSearchResult(null);
                }
              } else if (event.type === 'error') {
                setSearchError(event.error ?? 'Search failed');
              }
            } catch {
              // Skip malformed lines.
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setSearchError('An error occurred while searching. Please try again.');
        }
      } finally {
        setSearchLoading(false);
        setProgressMessage(null);
      }
    },
    [activeDateRange, fromDate, isDemo, mode, query, selectedModel, toDate],
  );

  const handleStop = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setSearchLoading(false);
    setProgressMessage(null);
    setSearchResult(null);
    setSearchError(null);
    setDaysSearched(0);
    setCanContinue(false);
    setSearchMode(null);
    setShowNoAnswerTips(false);
  }, []);

  const saveSearchToRepo = useCallback(async () => {
    if (!searchResult) return;

    const date = todayISO();

    if (isDemo) {
      setSearchSaveMessage(`summaries/${date}-search.md`);
      return;
    }

    setSavingSearch(true);
    setSearchError(null);
    setSearchSaveMessage(null);

    try {
      let res = await fetch('/api/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: searchResult, date, type: 'search' }),
      });

      if (!res.ok) {
        res = await fetch('/api/summary/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: `${date}-search.md`, content: searchResult }),
        });
      }

      if (!res.ok) throw new Error('Failed to save');

      const data = await res.json().catch(() => ({}));
      const savedPath = data.path ?? data.filename ?? `${date}-search.md`;
      const committed = data.committed;
      const prefix = committed === false ? 'Saved to disk.' : 'Saved and committed!';
      setSearchSaveMessage(`${prefix} summaries/${savedPath}`);
    } catch {
      setSearchError('Failed to save search result to repository.');
    } finally {
      setSavingSearch(false);
    }
  }, [isDemo, searchResult]);

  const downloadSearchMarkdown = useCallback(() => {
    if (!searchResult) return;
    const date = todayISO();
    const blob = new Blob([searchResult], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `search-${date}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [searchResult]);

  const handlePresetClick = useCallback(
    (label: string, value: string) => {
      setSelectedPreset(label);
      setQuery(value);
      setTextError(null);
      setSearchError(null);
      setSearchSaveMessage(null);
      setShowNoAnswerTips(false);

      if (mode === 'text') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        void runTextSearch(value);
      } else {
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [mode, runTextSearch],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return;

      e.preventDefault();
      if (mode === 'text') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        void runTextSearch(query);
        return;
      }

      if (!searchLoading) {
        void handleAiSearch(0);
      }
    },
    [handleAiSearch, mode, query, runTextSearch, searchLoading],
  );

  const modeOptions = useMemo(
    () => [
      { value: 'text', label: 'Text' },
      { value: 'ai', label: 'AI' },
      { value: 'ai-keywords', label: 'AI + Keywords' },
    ] satisfies Array<{ value: SearchMode; label: string }>,
    [],
  );

  if (!isOpen) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-full max-w-2xl mx-4 rounded-2xl ring-1 ring-border bg-popover shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedPreset(null);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search your work logs…"
            className={`flex-1 ${INPUT_CLASSES}`}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            disabled={searchLoading}
          />
          {anyLoading && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" aria-hidden="true" />}
          <button
            onClick={handleClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-5">
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Presets
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {SEARCH_PRESETS.map((preset) => {
                  const isActive = selectedPreset === preset.label;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handlePresetClick(preset.label, preset.value)}
                      className={[
                        'rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap',
                        isActive ? 'bg-primary/10 border-primary/30 text-primary' : '',
                      ].join(' ')}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Mode
                  </div>
                  <div className="inline-flex rounded-xl bg-muted p-1">
                    {modeOptions.map((option) => {
                      const selected = mode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setMode(option.value)}
                          className={[
                            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                            selected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:text-foreground',
                          ].join(' ')}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-start sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setDateRangeOpen((open) => !open)}
                    className={[MUTED_BUTTON_CLASSES, 'inline-flex items-center gap-2'].join(' ')}
                  >
                    <Calendar className="h-4 w-4" aria-hidden="true" />
                    <span>📅 Date range</span>
                    {activeDateRange && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">On</span>}
                    <ChevronDown
                      className={[
                        'h-4 w-4 transition-transform',
                        dateRangeOpen ? 'rotate-180' : '',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>

              {isAiMode && (
                <div>
                  <label htmlFor="search-modal-model" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Model
                  </label>
                  <select
                    id="search-modal-model"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={searchLoading || modelsLoading}
                    className={`w-full cursor-pointer ${INPUT_CLASSES}`}
                  >
                    {models.map((modelOption) => (
                      <option key={modelOption.id} value={modelOption.id}>
                        {modelOption.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {dateRangeOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end rounded-xl border border-border bg-card px-4 py-3">
                  <div>
                    <label htmlFor="search-modal-from-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      From
                    </label>
                    <input
                      id="search-modal-from-date"
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className={`w-full ${INPUT_CLASSES}`}
                    />
                  </div>
                  <div className="text-muted-foreground text-sm px-1 pb-2 text-center">→</div>
                  <div>
                    <label htmlFor="search-modal-to-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      To
                    </label>
                    <input
                      id="search-modal-to-date"
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className={`w-full ${INPUT_CLASSES}`}
                    />
                  </div>
                </div>
              )}
            </div>

            {mode === 'text' ? (
              <div className="space-y-3">
                {textError && (
                  <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {textError}
                  </div>
                )}

                {!textError && !textSearched && !textLoading && (
                  <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Type to search across all your work log entries.
                  </div>
                )}

                {!textError && textSearched && !textLoading && textResults.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    No log entries found for <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span>
                  </div>
                )}

                {!textError && textResults.map(({ date, excerpts }) => (
                  <div key={date} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                        <span className="text-xs font-semibold text-foreground truncate">{formatDate(date)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate(date)}
                        className="text-xs text-accent-foreground font-medium hover:underline transition-colors shrink-0"
                      >
                        Go to date →
                      </button>
                    </div>
                    <div className="divide-y divide-border/50">
                      {excerpts.map((excerpt, index) => (
                        <p
                          key={`${date}-${index}`}
                          className="px-4 py-2.5 text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono"
                          dangerouslySetInnerHTML={{ __html: highlightQuery(excerpt, query) }}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {!textError && textResults.length > 0 && (
                  <p className="text-center text-[10px] text-muted-foreground py-2">
                    {textResults.length} day{textResults.length !== 1 ? 's' : ''} matched
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {searchLoading && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border">
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
                    <span className="text-sm text-muted-foreground">
                      {progressMessage ?? 'Starting search...'}
                    </span>
                  </div>
                )}

                {showLongSearchWarning && !exhausted && (
                  <div className="text-sm text-warning-foreground bg-warning/10 p-3 rounded-xl border border-warning/20 flex items-center gap-2">
                    <span>⏳</span>
                    Searching far back in history — this may take a while.
                  </div>
                )}

                {canContinue && !searchLoading && (
                  <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Searched the last {daysSearched} days but couldn&apos;t find a clear answer. Want to keep looking further back?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleAiSearch(daysSearched)}
                        className={PRIMARY_BUTTON_CLASSES}
                      >
                        Keep Searching
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCanContinue(false);
                          setShowNoAnswerTips(true);
                        }}
                        className={MUTED_BUTTON_CLASSES}
                      >
                        Can&apos;t find it
                      </button>
                    </div>
                  </div>
                )}

                {showNoAnswerTips && !searchLoading && !searchResult && (
                  <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    Try rephrasing your query, broadening the date range, or switching to <span className="text-foreground font-medium">AI + Keywords</span>.
                  </div>
                )}

                {searchResult && (
                  <div className="mt-2 pt-4 border-t border-border">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Answer
                      </label>
                      <span className="text-[10px] text-muted-foreground text-right">
                        Searched {daysSearched} day{daysSearched === 1 ? '' : 's'}{searchMode ? ` · ${searchMode.replace(/_/g, ' ')}` : ''}
                      </span>
                    </div>
                    <MarkdownViewer
                      content={searchResult}
                      className="rounded-xl border border-input bg-muted px-4 py-3 text-foreground"
                    />
                  </div>
                )}

                {searchError && (
                  <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {searchError}
                  </div>
                )}

                {searchSaveMessage && (
                  <div className="text-sm text-success bg-success/10 p-4 rounded-xl border border-success/20 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {searchSaveMessage}
                  </div>
                )}

                {!searchLoading && !searchError && !searchResult && !canContinue && !showNoAnswerTips && (
                  <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Ask a question about your work logs, then press Enter or click Search.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {isAiMode && (
          <div className="border-t border-border px-6 py-4 flex justify-between items-center bg-popover sticky bottom-0 z-10 gap-3">
            <div className="flex gap-2 flex-wrap">
              {searchResult && (
                <>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(searchResult)}
                    className={MUTED_BUTTON_CLASSES}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={downloadSearchMarkdown}
                    className={MUTED_BUTTON_CLASSES}
                  >
                    Download .md
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSearchToRepo()}
                    disabled={savingSearch}
                    className={MUTED_BUTTON_CLASSES}
                  >
                    {savingSearch ? 'Committing...' : 'Save & Commit'}
                  </button>
                </>
              )}
            </div>
            {searchLoading ? (
              <button type="button" onClick={handleStop} className={STOP_BUTTON_CLASSES}>
                <Square className="h-3.5 w-3.5 inline-block mr-1.5 fill-current" aria-hidden="true" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleAiSearch(0)}
                disabled={!query.trim() || modelsLoading || !selectedModel}
                className={PRIMARY_BUTTON_CLASSES}
              >
                <Search className="h-3.5 w-3.5 inline-block mr-1.5" aria-hidden="true" />
                Search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
}
