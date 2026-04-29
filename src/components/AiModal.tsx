'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useModels } from '@/hooks/useModels';
import MarkdownViewer from '@/components/MarkdownViewer';
import { DEMO_SUMMARY_RESULT } from '@/lib/demo';

interface SummaryPrompt {
  id: string;
  label: string;
  value: string;
  is_builtin: boolean;
}

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

  function todayISO() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

  function daysAgoISO(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }

  // Summarize pane state
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [prompts, setPrompts] = useState<SummaryPrompt[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState('daily-standup');
  const [customPrompt, setCustomPrompt] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [newPromptLabel, setNewPromptLabel] = useState('');
  const [promptSaveError, setPromptSaveError] = useState<string | null>(null);

  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedPromptId);
  const dailyStandupValue = prompts.find((prompt) => prompt.id === 'daily-standup')?.value ?? '';

  // Tab state
  const [activeTab, setActiveTab] = useState<'summarize' | 'prompts'>('summarize');

  // Prompts-tab editing state
  const [editingPrompts, setEditingPrompts] = useState<Record<string, { label: string; value: string }>>({});
  const [promptErrors, setPromptErrors] = useState<Record<string, string>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newError, setNewError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPromptsLoading(true);
    fetch('/api/summary-prompts')
      .then((r) => r.json())
      .then((data) => setPrompts(data.prompts ?? []))
      .catch(() => {})
      .finally(() => setPromptsLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || customPrompt || !selectedPrompt) return;
    setCustomPrompt(selectedPrompt.value);
  }, [customPrompt, isOpen, selectedPrompt]);

  const handlePromptSelect = useCallback((prompt: SummaryPrompt) => {
    setSelectedPromptId(prompt.id);
    setCustomPrompt(prompt.value);

    if (prompt.id === 'daily-standup') {
      const today = todayISO();
      setStartDate(today);
      setEndDate(today);
      return;
    }

    if (prompt.id === 'weekly-report' || prompt.id === 'ai-usage') {
      setStartDate(daysAgoISO(7));
      setEndDate(todayISO());
    }
  }, []);

  const handleSavePrompt = async () => {
    const label = newPromptLabel.trim();
    if (!label) return;

    setPromptSaveError(null);

    try {
      const res = await fetch('/api/summary-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, value: customPrompt }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPromptSaveError(data.error ?? 'Failed to save');
        return;
      }

      const data = await res.json();
      setPrompts((prev) => [...prev, data.prompt]);
      setSelectedPromptId(data.prompt.id);
      setSavingPrompt(false);
      setNewPromptLabel('');
    } catch {
      setPromptSaveError('Failed to save template');
    }
  };

  const handleDeletePrompt = async (id: string) => {
    try {
      const res = await fetch(`/api/summary-prompts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) return;

      setPrompts((prev) => prev.filter((prompt) => prompt.id !== id));
      if (selectedPromptId === id) {
        setSelectedPromptId('daily-standup');
        setCustomPrompt(dailyStandupValue);
      }
    } catch {
      // Silent on purpose.
    }
  };

  // --- Prompts tab handlers ---

  const handleEditChange = (id: string, field: 'label' | 'value', val: string) => {
    setEditingPrompts((prev) => ({ ...prev, [id]: { ...prev[id], label: prev[id]?.label ?? '', value: prev[id]?.value ?? '', [field]: val } }));
    setPromptErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const getEditing = (prompt: SummaryPrompt) =>
    editingPrompts[prompt.id] ?? { label: prompt.label, value: prompt.value };

  const isDirty = (prompt: SummaryPrompt) => {
    const e = editingPrompts[prompt.id];
    return e !== undefined && (e.label !== prompt.label || e.value !== prompt.value);
  };

  const handleSaveEdit = async (prompt: SummaryPrompt) => {
    const e = editingPrompts[prompt.id];
    if (!e) return;
    const label = e.label.trim();
    const value = e.value.trim();
    if (!label || !value) {
      setPromptErrors((prev) => ({ ...prev, [prompt.id]: 'Label and value are required' }));
      return;
    }
    try {
      const res = await fetch('/api/summary-prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prompt.id, label, value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPromptErrors((prev) => ({ ...prev, [prompt.id]: data.error ?? 'Failed to save' }));
        return;
      }
      const data = await res.json();
      setPrompts((prev) => prev.map((p) => p.id === prompt.id ? data.prompt : p));
      setEditingPrompts((prev) => { const n = { ...prev }; delete n[prompt.id]; return n; });
    } catch {
      setPromptErrors((prev) => ({ ...prev, [prompt.id]: 'Failed to save' }));
    }
  };

  const handleResetBuiltin = async (prompt: SummaryPrompt) => {
    try {
      const res = await fetch(`/api/summary-prompts?id=${encodeURIComponent(prompt.id)}`, { method: 'PATCH' });
      if (!res.ok) return;
      const data = await res.json();
      setPrompts((prev) => prev.map((p) => p.id === prompt.id ? data.prompt : p));
      setEditingPrompts((prev) => { const n = { ...prev }; delete n[prompt.id]; return n; });
    } catch { /* silent */ }
  };

  const isBuiltinOverridden = (prompt: SummaryPrompt) => {
    if (!prompt.is_builtin) return false;
    const e = editingPrompts[prompt.id];
    // Check if the stored prompt differs from BUILTIN defaults — we rely on the API to tell us
    // by checking if the label/value differ from what the original constants were.
    // Since we don't have the originals client-side, we use a flag: if the user has edited it via PUT,
    // the API returns the overridden values. We track "isOverride" by seeing if GET value differs
    // from the hardcoded defaults below.
    if (e) return true;
    return false;
  };

  const handleAddNew = async () => {
    const label = newLabel.trim();
    const value = newValue.trim();
    if (!label || !value) { setNewError('Both label and value are required'); return; }
    setNewError(null);
    try {
      const res = await fetch('/api/summary-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNewError(data.error ?? 'Failed to add');
        return;
      }
      const data = await res.json();
      setPrompts((prev) => [...prev, data.prompt]);
      setAddingNew(false);
      setNewLabel('');
      setNewValue('');
    } catch {
      setNewError('Failed to add prompt');
    }
  };

  // --- Close / reset ---

  const handleClose = useCallback(() => {
    setStartDate(defaultDate);
    setEndDate(defaultDate);
    setSelectedPromptId('daily-standup');
    setCustomPrompt(dailyStandupValue);
    setSummaryResult(null);
    setSummaryError(null);
    setSummaryLoading(false);
    setSaving(false);
    setSaveMessage(null);
    setSavingPrompt(false);
    setNewPromptLabel('');
    setPromptSaveError(null);
    setActiveTab('summarize');
    setEditingPrompts({});
    setPromptErrors({});
    setAddingNew(false);
    setNewLabel('');
    setNewValue('');
    setNewError(null);
    onClose();
  }, [dailyStandupValue, defaultDate, onClose]);

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

    const matchedPrompt = prompts.find((prompt) => prompt.value === customPrompt);
    const slug = matchedPrompt ? matchedPrompt.label.toLowerCase().replace(/\s+/g, '-') : 'custom-summary';

    if (isDemo) {
      setSaveMessage(`summaries/${endDate}-${slug}.md`);
      return;
    }

    setSaving(true);
    setSummaryError(null);

    try {
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
        <div className="border-b border-border px-6 pt-4 pb-0 bg-popover sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <h2 id="ai-modal-title" className="text-lg font-semibold text-popover-foreground">AI Summary</h2>
            <button onClick={handleClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <div className="flex gap-1 -mb-px">
            {(['summarize', 'prompts'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={[
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize',
                  activeTab === tab
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {tab === 'summarize' ? 'Summarize' : 'Prompts'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        {activeTab === 'summarize' ? (
          <>
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
                  <label htmlFor="ai-summary-template" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Template</label>
                  <div className="flex items-center gap-2">
                    <select
                      id="ai-summary-template"
                      value={selectedPromptId}
                      onChange={(e) => {
                        const p = prompts.find((pr) => pr.id === e.target.value);
                        if (p) handlePromptSelect(p);
                      }}
                      disabled={promptsLoading && prompts.length === 0}
                      className="flex-1 rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer"
                    >
                      {prompts.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    {selectedPrompt && !selectedPrompt.is_builtin && (
                      <button
                        type="button"
                        onClick={() => void handleDeletePrompt(selectedPrompt.id)}
                        className="rounded-lg px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label={`Delete ${selectedPrompt.label}`}
                      >
                        Delete
                      </button>
                    )}
                  </div>
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
                <div className="flex items-center gap-2 mt-1">
                  {customPrompt !== (selectedPrompt?.value ?? '') && (
                    savingPrompt ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newPromptLabel}
                          onChange={(e) => setNewPromptLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSavePrompt();
                            if (e.key === 'Escape') setSavingPrompt(false);
                          }}
                          placeholder="Template name…"
                          className="rounded-lg border border-input bg-muted/50 px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
                          autoFocus
                        />
                        <button onClick={() => void handleSavePrompt()} className="text-xs text-primary hover:underline">Save</button>
                        <button onClick={() => setSavingPrompt(false)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setNewPromptLabel('');
                          setPromptSaveError(null);
                          setSavingPrompt(true);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        + Save as template
                      </button>
                    )
                  )}
                  {promptSaveError && <span className="text-xs text-destructive">{promptSaveError}</span>}
                </div>
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
          </>
        ) : (
          /* Prompts tab */
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {promptsLoading && prompts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Loading prompts…</div>
            ) : (
              <>
                {prompts.map((prompt) => {
                  const editing = getEditing(prompt);
                  const dirty = isDirty(prompt);
                  const err = promptErrors[prompt.id];
                  return (
                    <div key={prompt.id} className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editing.label}
                          onChange={(e) => handleEditChange(prompt.id, 'label', e.target.value)}
                          className="flex-1 rounded-lg border border-input bg-muted/50 px-2 py-1 text-sm font-medium text-foreground outline-none focus:border-primary"
                          placeholder="Template name"
                        />
                        {prompt.is_builtin && (
                          <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5">built-in</span>
                        )}
                      </div>
                      <textarea
                        value={editing.value}
                        onChange={(e) => handleEditChange(prompt.id, 'value', e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-input bg-muted/50 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary resize-none"
                        placeholder="Prompt instructions…"
                      />
                      {err && <p className="text-xs text-destructive">{err}</p>}
                      <div className="flex items-center gap-2 justify-end">
                        {dirty && (
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit(prompt)}
                            className="rounded-lg px-3 py-1 text-xs font-medium bg-primary text-primary-foreground transition-opacity hover:opacity-90"
                          >
                            Save
                          </button>
                        )}
                        {prompt.is_builtin && isBuiltinOverridden(prompt) && (
                          <button
                            type="button"
                            onClick={() => void handleResetBuiltin(prompt)}
                            className="rounded-lg px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Reset to default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDeletePrompt(prompt.id)}
                          className="rounded-lg px-3 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add new prompt */}
                {addingNew ? (
                  <div className="rounded-xl border border-dashed border-border px-4 py-3 space-y-2">
                    <input
                      type="text"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="Template name"
                      className="w-full rounded-lg border border-input bg-muted/50 px-2 py-1 text-sm font-medium text-foreground outline-none focus:border-primary"
                      autoFocus
                    />
                    <textarea
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      rows={3}
                      placeholder="Prompt instructions…"
                      className="w-full rounded-lg border border-input bg-muted/50 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary resize-none"
                    />
                    {newError && <p className="text-xs text-destructive">{newError}</p>}
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => { setAddingNew(false); setNewLabel(''); setNewValue(''); setNewError(null); }} className="rounded-lg px-3 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                      <button type="button" onClick={() => void handleAddNew()} className="rounded-lg px-3 py-1 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90">Add</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingNew(true)}
                    className="w-full rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                  >
                    + Add prompt
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
