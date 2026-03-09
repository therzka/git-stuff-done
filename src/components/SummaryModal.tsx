'use client';

import { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, ChevronDown, Check, Copy, Download } from 'lucide-react';

const DEFAULT_PROMPTS = [
  { label: 'Daily Standup', value: 'Summarize my work for a daily standup meeting. Focus on what was completed, what is in progress, and any blockers.' },
  { label: 'Weekly Report', value: 'Create a weekly report summarizing key achievements, PRs merged, and tasks completed. Group by project or topic.' },
  { label: 'Detailed Changelog', value: 'List all technical changes, bug fixes, and refactors in a changelog format.' },
  { label: 'Custom', value: '' },
];

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate: string;
}

const MODELS = [
  { label: 'GPT 5.2', value: 'gpt-5.2' },
  { label: 'GPT 4.1', value: 'gpt-4.1' },
  { label: 'Claude 4.6 Sonnet', value: 'claude-sonnet-4.6' },
];

export default function SummaryModal({ isOpen, onClose, defaultDate, isDemo = false }: SummaryModalProps & { isDemo?: boolean }) {
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_PROMPTS[0].value);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePromptChange = (val: string) => {
    setCustomPrompt(val);
  };

  const generateSummary = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    if (isDemo) {
      setTimeout(() => {
        setResult("## Demo Summary\n\nThis is a generated summary of your work. In a real environment, this would be an AI-generated summary of your logs and pull requests.\n\n### Key Achievements\n- Implemented new features\n- Fixed critical bugs\n- Collaborated with the team\n\n### Next Steps\n- Deploy to production\n- Monitor performance");
        setLoading(false);
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
      setResult(data.summary);
    } catch (err) {
      setError('An error occurred while generating the summary.');
    } finally {
      setLoading(false);
    }
  };

  const saveToRepo = async () => {
    if (!result) return;
    if (isDemo) {
      setSaveMessage("Demo mode — would save to: summaries/" + endDate + "-summary.md");
      setTimeout(() => { if (mountedRef.current) setSaveMessage(null); }, 4000);
      return;
    }
    setSaving(true);
    setError(null);

    try {
        // Generate filename: YYYY-MM-DD-{slug}.md
        // Find which prompt was selected by matching value
        const selectedPrompt = DEFAULT_PROMPTS.find(p => p.value === customPrompt);
        
        let slug = 'custom-summary';
        if (selectedPrompt) {
            slug = selectedPrompt.label.toLowerCase().replace(/\s+/g, '-');
        } else {
            // If custom prompt text doesn't match a preset exactly, it's custom
             slug = 'custom-summary';
        }

        const filename = `${endDate}-${slug}.md`;

        const res = await fetch('/api/summary/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, content: result }),
        });

        if (!res.ok) throw new Error('Failed to save summary');
        
        const data = await res.json();
        const msg = data.committed ? 'Saved and pushed to repo!' : 'Saved to disk (commit skipped/failed).';
        setSaveMessage(`${msg} — summaries/${filename}`);
        setTimeout(() => { if (mountedRef.current) setSaveMessage(null); }, 4000);
    } catch (err) {
        console.error(err);
        setError('Failed to save summary to repository.');
    } finally {
        setSaving(false);
    }
  };

  const copyToClipboard = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => { if (mountedRef.current) setCopied(false); }, 2000);
    } catch {
      setError('Failed to copy to clipboard.');
    }
  };

  const downloadMarkdown = () => {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summary-${startDate}-to-${endDate}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => { if (mountedRef.current) setDownloaded(false); }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onMouseDown={(e) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); }}>
      <div ref={panelRef} className="w-full max-w-2xl rounded-2xl bg-popover shadow-xl ring-1 ring-border max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-popover sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-popover-foreground">Generate Summary</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="summary-start-date" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Start Date</label>
              <input
                id="summary-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all"
              />
            </div>
            <div>
              <label htmlFor="summary-end-date" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">End Date</label>
              <input
                id="summary-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="summary-prompt-template" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Prompt Template</label>
              <div className="relative">
                <select
                  id="summary-prompt-template"
                  onChange={(e) => handlePromptChange(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-input bg-muted/50 pl-3 pr-9 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer"
                >
                  {DEFAULT_PROMPTS.map((p, idx) => (
                    <option key={idx} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>
            <div>
              <label htmlFor="summary-model" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">AI Model</label>
              <div className="relative">
                <select
                  id="summary-model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-input bg-muted/50 pl-3 pr-9 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer"
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>
          </div>

          {/* Custom Prompt Textarea */}
          <div>
            <label htmlFor="summary-instructions" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Instructions</label>
            <textarea
              id="summary-instructions"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="w-full h-32 rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 resize-none transition-all"
              placeholder="Enter custom instructions for the summary..."
            />
          </div>

          {/* Result Area */}
          {result && (
            <div className="mt-6 pt-6 border-t border-border">
              <label htmlFor="summary-result" className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Generated Summary</label>
              <textarea
                id="summary-result"
                readOnly
                value={result}
                className="w-full h-64 rounded-xl border border-input bg-muted px-4 py-3 text-sm text-foreground font-mono outline-none resize-none"
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-between items-center bg-popover sticky bottom-0 z-10">
          <div className="flex gap-2">
            {result && (
              <>
                <button
                  onClick={copyToClipboard}
                  className={`rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-all ${copied ? 'text-emerald-500 border border-emerald-500/30 bg-emerald-500/10' : 'text-muted-foreground border border-border bg-muted/50 hover:bg-muted hover:shadow-sm'}`}
                >
                  {copied ? <><Check className="h-3.5 w-3.5" aria-hidden="true" />Copied!</> : <><Copy className="h-3.5 w-3.5" aria-hidden="true" />Copy</>}
                </button>
                <button
                  onClick={downloadMarkdown}
                  className={`rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-all ${downloaded ? 'text-emerald-500 border border-emerald-500/30 bg-emerald-500/10' : 'text-muted-foreground border border-border bg-muted/50 hover:bg-muted hover:shadow-sm'}`}
                >
                  {downloaded ? <><Check className="h-3.5 w-3.5" aria-hidden="true" />Downloaded!</> : <><Download className="h-3.5 w-3.5" aria-hidden="true" />Download .md</>}
                </button>
                <button
                  onClick={saveToRepo}
                  disabled={saving}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground border border-border bg-muted/50 hover:bg-muted hover:shadow-sm cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Committing...' : 'Save & Commit'}
                </button>
              </>
            )}
          </div>
          <button
            onClick={generateSummary}
            disabled={loading}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating...' : 'Generate Summary'}
          </button>
        </div>
        {saveMessage && (
          <div className="border-t border-border px-6 py-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> {saveMessage}
          </div>
        )}
      </div>
    </div>
  );
}
