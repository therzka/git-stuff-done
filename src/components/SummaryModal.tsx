'use client';

import { useEffect, useRef, useState } from 'react';

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
  const panelRef = useRef<HTMLDivElement>(null);

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

    console.log('Generating summary with:', { startDate, endDate, customPrompt });

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
      alert("In demo mode, this would save to: summaries/" + endDate + "-summary.md");
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
        alert(`${msg}\nFile: summaries/${filename}`);
    } catch (err) {
        console.error(err);
        setError('Failed to save summary to repository.');
    } finally {
        setSaving(false);
    }
  };

  const copyToClipboard = () => {
    if (result) navigator.clipboard.writeText(result);
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
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onMouseDown={(e) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); }}>
      <div ref={panelRef} className="w-full max-w-2xl rounded-2xl bg-popover shadow-xl ring-1 ring-border max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-popover/50 backdrop-blur-sm sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-popover-foreground">Generate Summary</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Prompt Template</label>
              <select
                onChange={(e) => handlePromptChange(e.target.value)}
                className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer"
              >
                {DEFAULT_PROMPTS.map((p, idx) => (
                  <option key={idx} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">AI Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Prompt Textarea */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Instructions</label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="w-full h-32 rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 resize-none transition-all"
              placeholder="Enter custom instructions for the summary..."
            />
          </div>

          {/* Result Area */}
          {result && (
            <div className="mt-6 pt-6 border-t border-border">
              <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Generated Summary</label>
              <textarea
                readOnly
                value={result}
                className="w-full h-64 rounded-xl border border-input bg-muted px-4 py-3 text-sm text-foreground font-mono outline-none resize-none"
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 p-4 rounded-xl border border-red-100 dark:border-red-900/50 flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-between items-center bg-popover/80 backdrop-blur-sm sticky bottom-0 z-10">
          <div className="flex gap-2">
            {result && (
              <>
                <button
                  onClick={copyToClipboard}
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
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-primary to-accent-foreground px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
          >
            {loading ? 'Generating...' : 'Generate Summary'}
          </button>
        </div>
      </div>
    </div>
  );
}
