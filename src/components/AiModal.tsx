'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, Search, Square, CheckCircle2 } from 'lucide-react';
import { useModels } from '@/hooks/useModels';
import MarkdownViewer from '@/components/MarkdownViewer';
import { DEMO_SEARCH_QUERY, DEMO_SEARCH_RESULT, DEMO_SUMMARY_RESULT } from '@/lib/demo';

const DEFAULT_PROMPTS = [
  { label: 'Daily Standup', value: 'Summarize my work for a daily standup meeting. Focus on what was completed, what is in progress, and any blockers.' },
  { label: 'Weekly Report', value: 'Create a weekly report summarizing key achievements, PRs merged, and tasks completed. Group by project or topic.' },
  { label: 'Detailed Changelog', value: 'List all technical changes, bug fixes, and refactors in a changelog format.' },
  { label: 'AI Usage', value: 'Summarize how I used AI tools this past week. Include mentions of Copilot, AI-generated code, AI-assisted debugging, pair programming with AI, and any AI-related workflow patterns. Note which tasks AI helped with and how.' },
  { label: 'Custom', value: '' },
];

interface AiModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab: 'search' | 'summarize';
  defaultDate: string;
  isDemo?: boolean;
}

export default function AiModal({ isOpen, onClose, defaultTab, defaultDate, isDemo = false }: AiModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Dynamic model loading
  const { models, loading: modelsLoading } = useModels(isOpen);

  // Shared state
  const [activeTab, setActiveTab] = useState<'search' | 'summarize'>(defaultTab);
  const [selectedModel, setSelectedModel] = useState('');

  // Set default model once models load
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  // Search pane state
  const demoInitRef = useRef(false);
  const demoSummarizeInitRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState('');
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
  const [useKeywordPrefilter, setUseKeywordPrefilter] = useState(false);

  // Summarize pane state
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [selectedPromptIdx, setSelectedPromptIdx] = useState(0);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_PROMPTS[0].value);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // --- Close / reset ---

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    // Reset search state
    setQuery('');
    setSearchResult(null);
    setSearchError(null);
    setDaysSearched(0);
    setExhausted(false);
    setCanContinue(false);
    setSearchMode(null);
    setProgressMessage(null);
    setSearchLoading(false);
    setSavingSearch(false);
    setSearchSaveMessage(null);
    // Reset summarize state
    setStartDate(defaultDate);
    setEndDate(defaultDate);
    setCustomPrompt(DEFAULT_PROMPTS[0].value);
    setSelectedPromptIdx(0);
    setSummaryResult(null);
    setSummaryError(null);
    setSummaryLoading(false);
    setSaving(false);
    setSaveMessage(null);
    onClose();
  }, [defaultDate, onClose]);

  // Sync activeTab when modal opens with a new defaultTab
  useEffect(() => {
    if (isOpen) setActiveTab(defaultTab);
  }, [isOpen, defaultTab]);

  // Escape handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, handleClose]);

  // Search demo init
  useEffect(() => {
    if (isOpen && isDemo && !demoInitRef.current) {
      demoInitRef.current = true;
      setQuery(DEMO_SEARCH_QUERY);
      setSearchResult(DEMO_SEARCH_RESULT);
      setDaysSearched(7);
    }
    if (!isOpen) {
      demoInitRef.current = false;
    }
  }, [isOpen, isDemo]);

  // Summarize demo init
  useEffect(() => {
    if (isOpen && isDemo && !demoSummarizeInitRef.current) {
      demoSummarizeInitRef.current = true;
      setSummaryResult(DEMO_SUMMARY_RESULT);
    }
    if (!isOpen) {
      demoSummarizeInitRef.current = false;
    }
  }, [isOpen, isDemo]);

  if (!isOpen) return null;

  // --- Search logic ---

  function todayISO() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

  function daysAgoISO(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

  const handleSearch = async (offsetDays = 0) => {
    if (!query.trim()) return;

    setSearchLoading(true);
    setSearchError(null);
    setCanContinue(false);
    setProgressMessage(null);
    if (offsetDays === 0) {
      setSearchResult(null);
      setDaysSearched(0);
      setExhausted(false);
      setSearchMode(null);
    }

    if (isDemo) {
      setTimeout(() => {
        setSearchResult(DEMO_SEARCH_RESULT);
        setDaysSearched(7);
        setSearchLoading(false);
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
          useKeywordPrefilter,
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
        buffer = lines.pop()!;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === 'progress') {
              setProgressMessage(event.message);
              if (event.daysSearched != null) setDaysSearched(event.daysSearched);
              if (event.searchMode) setSearchMode(event.searchMode);
            } else if (event.type === 'complete') {
              setDaysSearched(event.daysSearched);
              setExhausted(event.exhausted);
              setSearchMode(event.searchMode ?? null);
              if (event.answer) {
                setSearchResult(event.answer);
                setCanContinue(false);
              } else {
                setCanContinue(event.searchMode === 'recent_first' && !event.exhausted);
                setSearchResult(null);
              }
            } else if (event.type === 'error') {
              setSearchError(event.error);
            }
          } catch {
            // skip malformed lines
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
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSearchLoading(false);
    setProgressMessage(null);
    setSearchResult(null);
    setSearchError(null);
    setDaysSearched(0);
    setCanContinue(false);
    setSearchMode(null);
  };

  const saveSearchToRepo = async () => {
    if (!searchResult) return;
    if (isDemo) {
      setSearchSaveMessage(`summaries/${todayISO()}-search-result.md`);
      return;
    }
    setSavingSearch(true);
    setSearchError(null);

    try {
      const slug = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      const filename = `${todayISO()}-search-${slug || 'result'}.md`;
      const content = `# Search: ${query.trim()}\n\n${searchResult}`;

      const res = await fetch('/api/summary/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      });

      if (!res.ok) throw new Error('Failed to save');

      const data = await res.json();
      const msg = data.committed ? 'Saved and committed!' : 'Saved to disk.';
      setSearchSaveMessage(`${msg} summaries/${filename}`);
    } catch {
      setSearchError('Failed to save search result to repository.');
    } finally {
      setSavingSearch(false);
    }
  };

  const downloadSearchMarkdown = () => {
    if (!searchResult) return;
    const content = `# Search: ${query.trim()}\n\n${searchResult}`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-result-${todayISO()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Summarize logic ---

  const generateSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryResult(null);
    setSaveMessage(null);

    if (isDemo) {
      setTimeout(() => {
        setSummaryResult(DEMO_SUMMARY_RESULT);
        setSummaryLoading(false);
      }, 1500);
      return;
    }

    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          prompt: customPrompt,
          model: selectedModel,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate summary');
      const data = await res.json();
      setSummaryResult(data.summary);
    } catch {
      setSummaryError('An error occurred while generating the summary.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const saveToRepo = async () => {
    if (!summaryResult) return;
    if (isDemo) {
      const slug = DEFAULT_PROMPTS.find(p => p.value === customPrompt)?.label.toLowerCase().replace(/\s+/g, '-') ?? 'custom-summary';
      setSaveMessage(`summaries/${endDate}-${slug}.md`);
      return;
    }
    setSaving(true);
    setSummaryError(null);

    try {
      const matchedPrompt = DEFAULT_PROMPTS.find(p => p.value === customPrompt);
      const slug = matchedPrompt && matchedPrompt.label !== 'Custom'
        ? matchedPrompt.label.toLowerCase().replace(/\s+/g, '-')
        : 'custom-summary';

      const filename = `${endDate}-${slug}.md`;

      const res = await fetch('/api/summary/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: summaryResult }),
      });

      if (!res.ok) throw new Error('Failed to save summary');

      const data = await res.json();
      const msg = data.committed ? 'Saved and committed!' : 'Saved to disk.';
      setSaveMessage(`${msg} summaries/${filename}`);
    } catch {
      setSummaryError('Failed to save summary to repository.');
    } finally {
      setSaving(false);
    }
  };

  const downloadMarkdown = () => {
    if (!summaryResult) return;
    const blob = new Blob([summaryResult], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summary-${startDate}-to-${endDate}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const showLongSearchWarning = daysSearched > 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onMouseDown={(e) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) handleClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="ai-modal-title" className="w-full max-w-2xl rounded-2xl bg-popover shadow-xl ring-1 ring-border max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border px-6 pt-4 pb-0 bg-popover sticky top-0 z-10">
          <div className="flex items-center justify-between pb-3">
            <h2 id="ai-modal-title" className="text-lg font-semibold text-popover-foreground">AI Assistant</h2>
            <button onClick={handleClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          {/* Tab bar */}
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('search')}
              className={`pb-2 text-sm transition-colors ${activeTab === 'search' ? 'text-foreground border-b-2 border-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Search
            </button>
            <button
              onClick={() => setActiveTab('summarize')}
              className={`pb-2 text-sm transition-colors ${activeTab === 'summarize' ? 'text-foreground border-b-2 border-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Summarize
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ===== Search Pane ===== */}
          <div className={activeTab === 'search' ? '' : 'hidden'}>
            <div className="space-y-4">
              {/* Query input */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Question</label>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !searchLoading) {
                      e.preventDefault();
                      handleSearch(0);
                    }
                  }}
                  className="w-full h-20 rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 resize-none transition-all"
                  placeholder='Ask a question about your work logs... (e.g. "What did I work on last week?")'
                  disabled={searchLoading}
                />
              </div>

              {/* Model selector */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">AI Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={searchLoading || modelsLoading}
                  className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Keyword pre-filter option */}
              <label className="flex items-start gap-3 rounded-xl border border-input bg-muted/30 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors select-none">
                <input
                  type="checkbox"
                  checked={useKeywordPrefilter}
                  onChange={(e) => setUseKeywordPrefilter(e.target.checked)}
                  disabled={searchLoading}
                  className="mt-0.5 h-4 w-4 rounded border-input accent-primary shrink-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">⚡ Pre-filter with keyword search</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Uses the selected model to extract keywords, then narrows to matching days before AI reasoning — faster for most searches.
                  </p>
                </div>
              </label>

              {/* Loading / Progress */}
              {searchLoading && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm text-muted-foreground">
                    {progressMessage ?? 'Starting search...'}
                  </span>
                </div>
              )}

              {/* Long search warning */}
              {showLongSearchWarning && !exhausted && (
                <div className="text-sm text-warning-foreground bg-warning/10 p-3 rounded-xl border border-warning/20 flex items-center gap-2">
                  <span>⏳</span> Searching far back in history — this may take a while.
                </div>
              )}

              {/* Continue searching prompt */}
              {canContinue && !searchLoading && (
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
              {searchResult && (
                <div className="mt-2 pt-4 border-t border-border">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">Answer</label>
                    <span className="text-[10px] text-muted-foreground">
                      Searched {daysSearched} days
                    </span>
                  </div>
                  <MarkdownViewer
                    content={searchResult}
                    className="rounded-xl border border-input bg-muted px-4 py-3 text-foreground"
                  />
                </div>
              )}

              {/* Error */}
              {searchError && (
                <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {searchError}
                </div>
              )}

              {/* Save success */}
              {searchSaveMessage && (
                <div className="text-sm text-success bg-success/10 p-4 rounded-xl border border-success/20 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {searchSaveMessage}
                </div>
              )}
            </div>
          </div>

          {/* ===== Summarize Pane ===== */}
          <div className={activeTab === 'summarize' ? '' : 'hidden'}>
            <div className="space-y-6">
              {/* Date Range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ai-summary-start-date" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Start Date</label>
                  <input
                    id="ai-summary-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="ai-summary-end-date" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">End Date</label>
                  <input
                    id="ai-summary-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ai-summary-prompt-template" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Prompt Template</label>
                  <select
                    id="ai-summary-prompt-template"
                    value={selectedPromptIdx}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setSelectedPromptIdx(idx);
                      setCustomPrompt(DEFAULT_PROMPTS[idx].value);
                      const label = DEFAULT_PROMPTS[idx].label;
                      if (label === 'Daily Standup') {
                        const today = todayISO();
                        setStartDate(today);
                        setEndDate(today);
                      } else if (label === 'Weekly Report' || label === 'AI Usage') {
                        setStartDate(daysAgoISO(7));
                        setEndDate(todayISO());
                      }
                    }}
                    className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer"
                  >
                    {DEFAULT_PROMPTS.map((p, idx) => (
                      <option key={idx} value={idx}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ai-summary-model" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">AI Model</label>
                  <select
                    id="ai-summary-model"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={modelsLoading}
                    className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Prompt Textarea */}
              <div>
                <label htmlFor="ai-summary-instructions" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Instructions</label>
                <textarea
                  id="ai-summary-instructions"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full h-32 rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 resize-none transition-all"
                  placeholder="Enter custom instructions for the summary..."
                />
              </div>

              {/* Loading */}
              {summaryLoading && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm text-muted-foreground">Generating summary...</span>
                </div>
              )}

              {/* Result Area */}
              {summaryResult && (
                <div className="mt-6 pt-6 border-t border-border">
                  <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Generated Summary</label>
                  <MarkdownViewer
                    content={summaryResult}
                    className="max-h-64 overflow-y-auto rounded-xl border border-input bg-muted px-4 py-3 text-foreground"
                  />
                </div>
              )}

              {/* Error */}
              {summaryError && (
                <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {summaryError}
                </div>
              )}

              {/* Save success */}
              {saveMessage && (
                <div className="text-sm text-success bg-success/10 p-4 rounded-xl border border-success/20 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {saveMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer — adapts based on active tab */}
        <div className="border-t border-border px-6 py-4 flex justify-between items-center bg-popover sticky bottom-0 z-10">
          {activeTab === 'search' ? (
            <>
              <div className="flex gap-2">
                {searchResult && (
                  <>
                    <button
                      onClick={() => navigator.clipboard.writeText(searchResult)}
                      className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:shadow-sm border border-transparent hover:border-border transition-all"
                    >
                      Copy
                    </button>
                    <button
                      onClick={downloadSearchMarkdown}
                      className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:shadow-sm border border-transparent hover:border-border transition-all"
                    >
                      Download .md
                    </button>
                    <button
                      onClick={saveSearchToRepo}
                      disabled={savingSearch}
                      className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:shadow-sm border border-transparent hover:border-border transition-all disabled:opacity-50"
                    >
                      {savingSearch ? 'Committing...' : 'Save & Commit'}
                    </button>
                  </>
                )}
              </div>
              {searchLoading ? (
                <button
                  onClick={handleStop}
                  className="rounded-xl bg-destructive px-6 py-2.5 text-sm font-semibold text-destructive-foreground shadow-sm transition-all hover:opacity-90"
                >
                  <Square className="h-3.5 w-3.5 inline-block mr-1.5 fill-current" aria-hidden="true" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => handleSearch(0)}
                  disabled={!query.trim()}
                  className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Search className="h-3.5 w-3.5 inline-block mr-1.5" aria-hidden="true" />Search
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex gap-2">
                {summaryResult && (
                  <>
                    <button
                      onClick={() => navigator.clipboard.writeText(summaryResult)}
                      className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:shadow-sm border border-transparent hover:border-border transition-all"
                    >
                      Copy
                    </button>
                    <button
                      onClick={downloadMarkdown}
                      className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:shadow-sm border border-transparent hover:border-border transition-all"
                    >
                      Download .md
                    </button>
                    <button
                      onClick={saveToRepo}
                      disabled={saving}
                      className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:shadow-sm border border-transparent hover:border-border transition-all disabled:opacity-50"
                    >
                      {saving ? 'Committing...' : 'Save & Commit'}
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={generateSummary}
                disabled={summaryLoading}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {summaryLoading ? 'Generating...' : 'Generate Summary'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
