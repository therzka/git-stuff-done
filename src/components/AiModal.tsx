'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useModels } from '@/hooks/useModels';
import MarkdownViewer from '@/components/MarkdownViewer';
import { DEMO_SUMMARY_RESULT } from '@/lib/demo';

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
  defaultDate: string;
  isDemo?: boolean;
}

export default function AiModal({ isOpen, onClose, defaultDate, isDemo = false }: AiModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Dynamic model loading
  const { models, loading: modelsLoading } = useModels(isOpen);

  const [selectedModel, setSelectedModel] = useState('');

  // Set default model once models load
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

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

  // Escape handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, handleClose]);

  // Summarize demo init
  useEffect(() => {
    if (isOpen && isDemo) {
      setSummaryResult(DEMO_SUMMARY_RESULT);
    }
  }, [isOpen, isDemo]);

  if (!isOpen) return null;

  function todayISO() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

  function daysAgoISO(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onMouseDown={(e) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) handleClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="ai-modal-title" className="w-full max-w-2xl rounded-2xl bg-popover shadow-xl ring-1 ring-border max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border px-6 pt-4 pb-3 bg-popover sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h2 id="ai-modal-title" className="text-lg font-semibold text-popover-foreground">AI Assistant</h2>
            <button onClick={handleClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div>
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

        <div className="border-t border-border px-6 py-4 flex justify-between items-center bg-popover sticky bottom-0 z-10">
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
        </div>
      </div>
    </div>
  );
}
