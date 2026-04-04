'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { useSearchParams } from 'next/navigation';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Upload, Moon, Sun, BarChart2, Search, Settings, LayoutGrid, AlignJustify, Menu, X, ChevronLeft, ChevronRight, FileText, Check, Minus, Sparkles } from 'lucide-react';
import RawWorkLog from './RawWorkLog';
import TodoList from './TodoList';
import MyPRs from './MyPRs';
import MyIssues from './MyIssues';
import GitHubNotifications from './GitHubNotifications';
import AgentSessions from './AgentSessions';
import AiModal from './AiModal';
import SummariesModal from './SummariesModal';
import CalendarPicker from './CalendarPicker';
import { GITHUB_ORG } from '@/lib/constants';
import { DEMO_CONFIG } from '@/lib/demo';

type PanelId = 'log' | 'todos' | 'prs' | 'issues' | 'notifs' | 'sessions';
type LayoutMode = 'grid' | 'column';

const PANEL_LABELS: Record<PanelId, string> = {
  log: 'Work Log',
  todos: 'TODOs',
  prs: 'My PRs',
  issues: 'My Issues',
  notifs: 'Notifications',
  sessions: 'Agent Sessions',
};
const ALL_PANELS: PanelId[] = ['log', 'todos', 'prs', 'issues', 'notifs', 'sessions'];
const DEFAULT_PANELS: PanelId[] = ['log', 'todos', 'prs', 'issues', 'notifs'];

type CommitState = 'idle' | 'committing' | 'success' | 'no-changes' | 'error';

const FONT_SIZE_OPTIONS = [
  { label: 'Compact', scale: '0.875' },
  { label: 'Default', scale: '1' },
  { label: 'Comfortable', scale: '1.125' },
  { label: 'Large', scale: '1.25' },
];

function loadFontScale(): string {
  if (typeof window === 'undefined') return '1';
  return localStorage.getItem('gsd-font-size') || '1';
}

function loadLayout(): LayoutMode {
  if (typeof window === 'undefined') return 'grid';
  return (localStorage.getItem('gsd-layout') as LayoutMode) || 'grid';
}
function loadVisiblePanels(): Set<PanelId> {
  if (typeof window === 'undefined') return new Set(ALL_PANELS);
  try {
    const stored = localStorage.getItem('gsd-visible-panels');
    if (stored) return new Set(JSON.parse(stored) as PanelId[]);
  } catch { /* ignore */ }
  return new Set(DEFAULT_PANELS);
}

const DEFAULT_PANEL_SIDE: Record<PanelId, 'left' | 'right'> = {
  log: 'left', todos: 'left',
  prs: 'right', issues: 'right', notifs: 'right', sessions: 'right',
};

function loadPanelOrder(): PanelId[] {
  if (typeof window === 'undefined') return [...ALL_PANELS];
  try {
    const stored = localStorage.getItem('gsd-panel-order');
    if (stored) {
      const parsed = JSON.parse(stored) as PanelId[];
      // Ensure all panels are present (handles new panels added later)
      const missing = ALL_PANELS.filter((id) => !parsed.includes(id));
      return [...parsed, ...missing];
    }
  } catch { /* ignore */ }
  return [...ALL_PANELS];
}

function loadPanelSide(): Record<PanelId, 'left' | 'right'> {
  if (typeof window === 'undefined') return { ...DEFAULT_PANEL_SIDE };
  try {
    const stored = localStorage.getItem('gsd-panel-sides');
    if (stored) return { ...DEFAULT_PANEL_SIDE, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_PANEL_SIDE };
}

function savePanelOrder(order: PanelId[]) {
  localStorage.setItem('gsd-panel-order', JSON.stringify(order));
}

function savePanelSide(sides: Record<PanelId, 'left' | 'right'>) {
  localStorage.setItem('gsd-panel-sides', JSON.stringify(sides));
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

export default function Dashboard() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === 'true' || process.env.NEXT_PUBLIC_DEMO === 'true';

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [commitState, setCommitState] = useState<CommitState>('idle');
  const [date, setDate] = useState(todayISO);
  const [aiModalTab, setAiModalTab] = useState<'search' | 'summarize' | null>(null);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const aiMenuBtnRef = useRef<HTMLButtonElement>(null);
  const aiMenuRef = useRef<HTMLDivElement>(null);
  const [aiMenuPos, setAiMenuPos] = useState({ top: 0, left: 0 });
  const [showSummaries, setShowSummaries] = useState(false);
  const insertAtCursorRef = useRef<((text: string) => void) | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layout & panel visibility
  const [layout, setLayout] = useState<LayoutMode>(loadLayout);
  const [visiblePanels, setVisiblePanels] = useState<Set<PanelId>>(loadVisiblePanels);
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  const panelMenuBtnRef = useRef<HTMLButtonElement>(null);
  const panelMenuRef = useRef<HTMLDivElement>(null);
  const [panelMenuPos, setPanelMenuPos] = useState({ top: 0, left: 0 });

  // Drag-and-drop order + side
  const [panelOrder, setPanelOrder] = useState<PanelId[]>(loadPanelOrder);
  const [panelSide, setPanelSide] = useState<Record<PanelId, 'left' | 'right'>>(loadPanelSide);
  const [activeDragId, setActiveDragId] = useState<PanelId | null>(null);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function toggleLayout() {
    const next: LayoutMode = layout === 'grid' ? 'column' : 'grid';
    setLayout(next);
    localStorage.setItem('gsd-layout', next);
  }

  function togglePanel(id: PanelId) {
    setVisiblePanels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('gsd-visible-panels', JSON.stringify([...next]));
      return next;
    });
  }

  function hidePanel(id: PanelId) {
    setVisiblePanels((prev) => {
      const next = new Set(prev);
      next.delete(id);
      localStorage.setItem('gsd-visible-panels', JSON.stringify([...next]));
      return next;
    });
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id as PanelId);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const activeId = active.id as PanelId;
    const overId = over.id as PanelId;

    // Guard: both IDs must be known panels
    if (!ALL_PANELS.includes(activeId) || !ALL_PANELS.includes(overId)) return;

    // Update order
    setPanelOrder((prev) => {
      const oldIndex = prev.indexOf(activeId);
      const newIndex = prev.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      savePanelOrder(next);
      return next;
    });

    // In grid mode: if dropped onto a panel in a different column, move it there
    if (layout === 'grid' && panelSide[activeId] !== panelSide[overId]) {
      setPanelSide((prev) => {
        const next = { ...prev, [activeId]: prev[overId] };
        savePanelSide(next);
        return next;
      });
    }
  }

  // Auto-switch to column layout on narrow screens
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < 1024 && layout === 'grid') {
        setLayout('column');
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [layout]);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelMenuRef.current && !panelMenuRef.current.contains(e.target as Node) &&
        panelMenuBtnRef.current && !panelMenuBtnRef.current.contains(e.target as Node)
      ) {
        setPanelMenuOpen(false);
      }
    }
    if (panelMenuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [panelMenuOpen]);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node) &&
        aiMenuBtnRef.current && !aiMenuBtnRef.current.contains(e.target as Node)
      ) {
        setAiMenuOpen(false);
      }
    }
    if (aiMenuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [aiMenuOpen]);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  function shiftDate(days: number) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }));
  }

  const isToday = date === todayISO();

  const [showSettings, setShowSettings] = useState(false);
  const [ignoredRepos, setIgnoredRepos] = useState<string[]>([]);
  const [repoInput, setRepoInput] = useState('');
  const [notifsKey, setNotifsKey] = useState(0);
  const [fontScale, setFontScale] = useState(loadFontScale);

  const fetchConfig = useCallback(async () => {
    if (isDemo) {
      setIgnoredRepos(DEMO_CONFIG.ignoredRepos);
      return;
    }
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setIgnoredRepos(data.ignoredRepos ?? []);
      const serverScale = data.fontSize ?? '1';
      setFontScale(serverScale);
      document.documentElement.style.setProperty('--text-scale', serverScale);
      localStorage.setItem('gsd-font-size', serverScale);
    } catch { /* ignore */ }
  }, [isDemo]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  async function saveIgnoredRepos(repos: string[]) {
    setIgnoredRepos(repos);
    if (!isDemo) {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ignoredRepos: repos }),
      });
    }
    setNotifsKey((k) => k + 1);
  }

  async function addIgnoredRepo() {
    const repo = repoInput.trim();
    if (!repo || ignoredRepos.includes(repo)) return;
    setRepoInput('');
    await saveIgnoredRepos([...ignoredRepos, repo]);
  }

  async function removeIgnoredRepo(repo: string) {
    await saveIgnoredRepos(ignoredRepos.filter((r) => r !== repo));
  }

  async function handleCommit() {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    setCommitState('committing');
    try {
      const res = await fetch('/api/commit', { method: 'POST' });
      if (!res.ok) {
        setCommitState('error');
      } else {
        const data = await res.json();
        setCommitState(data.committed ? 'success' : 'no-changes');
      }
    } catch {
      setCommitState('error');
    }
    commitTimerRef.current = setTimeout(() => setCommitState('idle'), 3000);
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground transition-colors duration-300">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-4 py-2 sm:px-6 sm:py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-x-2">
        <div className="flex items-center gap-3">
          <span
            className="text-base font-black tracking-tight sm:text-xl select-none"
            style={{ background: 'linear-gradient(90deg, #a855f7, #ec4899, #f97316, #eab308, #22c55e, #3b82f6, #a855f7)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'logo-shimmer 4s linear infinite' }}
          >
            git stuff done
          </span>
          {isDemo && (
            <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-500 uppercase tracking-wide">
              Demo Mode
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 justify-center">
          <button
            onClick={() => shiftDate(-1)}
            aria-label="Previous day"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <CalendarPicker date={date} onChange={setDate} />
          <button
            onClick={() => shiftDate(1)}
            aria-label="Next day"
            className={`rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground ${isToday ? 'invisible' : ''}`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setDate(todayISO())}
            className={`rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground transition hover:opacity-80 ${isToday ? 'invisible' : ''}`}
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-1 sm:gap-3 justify-end">
          <button
            onClick={handleCommit}
            disabled={commitState !== 'idle' || isDemo}
            title={isDemo ? 'Disabled in demo mode' : 'Push to GitHub'}
            className={`inline-flex items-center justify-center rounded-xl min-w-[2.75rem] sm:min-w-[8.5rem] px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors duration-300 sm:px-4 sm:text-sm ${
              commitState === 'success'
                ? 'bg-success text-success-foreground disabled:opacity-100'
                : commitState === 'error'
                  ? 'bg-destructive text-destructive-foreground disabled:opacity-100'
                  : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50'
            }`}
          >
            {commitState === 'committing' && (
              <><Upload className="h-3.5 w-3.5 animate-pulse sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">Committing…</span></>
            )}
            {commitState === 'idle' && (
              <><Upload className="h-3.5 w-3.5 sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">Commit &amp; Push</span></>
            )}
            {commitState === 'success' && (
              <><Check className="h-3.5 w-3.5 sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">✓ Committed</span></>
            )}
            {commitState === 'no-changes' && (
              <><Minus className="h-3.5 w-3.5 sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">No changes</span></>
            )}
            {commitState === 'error' && (
              <><X className="h-3.5 w-3.5 sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">Failed!</span></>
            )}
          </button>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Toggle Theme"
          >
            {mounted ? (theme === 'dark' ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />) : <span className="h-4 w-4 inline-block" />}
          </button>
          <button
            ref={aiMenuBtnRef}
            onClick={() => {
              if (!aiMenuOpen && aiMenuBtnRef.current) {
                const rect = aiMenuBtnRef.current.getBoundingClientRect();
                setAiMenuPos({ top: rect.bottom + 8, left: rect.right });
              }
              setAiMenuOpen((o) => !o);
            }}
            className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="AI Assistant"
            title="AI Assistant"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setShowSummaries(true)}
            className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Saved Summaries"
            title="View Saved Summaries"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={toggleLayout}
            className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Toggle layout"
            title={layout === 'grid' ? 'Switch to column layout' : 'Switch to grid layout'}
          >
            {layout === 'grid' ? <LayoutGrid className="h-4 w-4" aria-hidden="true" /> : <AlignJustify className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button
            ref={panelMenuBtnRef}
            onClick={() => {
              if (!panelMenuOpen && panelMenuBtnRef.current) {
                const rect = panelMenuBtnRef.current.getBoundingClientRect();
                setPanelMenuPos({ top: rect.bottom + 8, left: rect.right });
              }
              setPanelMenuOpen((o) => !o);
            }}
            className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Toggle panels"
            title="Show/hide panels"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Panel visibility dropdown (portal) */}
      {typeof document !== 'undefined' && panelMenuOpen
        ? createPortal(
            <div
              ref={panelMenuRef}
              style={{ position: 'fixed', top: panelMenuPos.top, left: panelMenuPos.left, transform: 'translateX(-100%)', zIndex: 9999 }}
              className="w-48 rounded-xl border border-border bg-popover shadow-xl p-2 select-none"
            >
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Panels</p>
              {ALL_PANELS.map((id) => (
                <label key={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted transition-colors">
                  <input
                    type="checkbox"
                    checked={visiblePanels.has(id)}
                    onChange={() => togglePanel(id)}
                    className="accent-primary"
                  />
                  <span className="text-foreground">{PANEL_LABELS[id]}</span>
                </label>
              ))}
            </div>,
            document.body,
          )
        : null}

      {/* AI menu dropdown (portal) */}
      {typeof document !== 'undefined' && aiMenuOpen
        ? createPortal(
            <div
              ref={aiMenuRef}
              style={{ position: 'fixed', top: aiMenuPos.top, left: aiMenuPos.left, transform: 'translateX(-100%)', zIndex: 9999 }}
              className="w-52 rounded-xl border border-border bg-popover shadow-xl p-2 select-none"
            >
              <button
                onClick={() => { setAiModalTab('search'); setAiMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Search Logs
              </button>
              <button
                onClick={() => { setAiModalTab('summarize'); setAiMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <BarChart2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Generate Summary
              </button>
            </div>,
            document.body,
          )
        : null}

      <AiModal
        isOpen={aiModalTab !== null}
        onClose={() => setAiModalTab(null)}
        defaultTab={aiModalTab ?? 'search'}
        defaultDate={date}
        isDemo={isDemo}
      />

      <SummariesModal
        isOpen={showSummaries}
        onClose={() => setShowSummaries(false)}
        isDemo={isDemo}
      />

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">Ignored Repos <span className="text-muted-foreground font-normal">(in {GITHUB_ORG} org)</span></h3>
            <button onClick={() => setShowSettings(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); addIgnoredRepo(); }} className="flex gap-2 mb-2">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="repo-name"
              className="flex-1 rounded-xl border border-input bg-muted/50 px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
            />
            <button type="submit" className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-80">Add</button>
          </form>
          {ignoredRepos.length === 0 ? (
            <p className="text-xs text-muted-foreground">No repos ignored.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ignoredRepos.map((repo) => (
                <span key={repo} className="inline-flex items-center gap-1 rounded-full bg-secondary border border-border px-3 py-1 text-xs text-secondary-foreground font-medium">
                  {repo}
                  <button onClick={() => removeIgnoredRepo(repo)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" aria-hidden="true" /></button>
                </span>
              ))}
            </div>
          )}
          {/* Layout Reset */}
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground mb-2">Panel Layout</h3>
            <button
              onClick={() => {
                const defaultOrder = [...ALL_PANELS];
                const defaultSides = { ...DEFAULT_PANEL_SIDE };
                setPanelOrder(defaultOrder);
                setPanelSide(defaultSides);
                savePanelOrder(defaultOrder);
                savePanelSide(defaultSides);
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            >
              Reset panel positions
            </button>
          </div>
          {/* Font Size */}
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground mb-2">Font Size</h3>
            <div className="flex gap-1.5">
              {FONT_SIZE_OPTIONS.map(({ label, scale }) => (
                <button
                  key={scale}
                  onClick={() => {
                    setFontScale(scale);
                    document.documentElement.style.setProperty('--text-scale', scale);
                    localStorage.setItem('gsd-font-size', scale);
                    if (!isDemo) {
                      fetch('/api/config', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fontSize: scale }),
                      });
                    }
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    fontScale === scale
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Panel layout */}
      {renderPanels()}
    </div>
  );

  function panelCard(id: PanelId, children: React.ReactNode, handleListeners?: React.HTMLAttributes<HTMLDivElement>) {
    return (
      <div className="group/card relative h-full">
        {/* Hide button */}
        <button
          onClick={() => hidePanel(id)}
          className="absolute -right-1 -top-1 z-10 rounded-full border border-border bg-card p-0.5 text-muted-foreground opacity-0 shadow-sm transition hover:bg-muted hover:text-foreground group-hover/card:opacity-100"
          aria-label={`Hide ${PANEL_LABELS[id]}`}
          title={`Hide ${PANEL_LABELS[id]}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="h-full overflow-hidden rounded-2xl border border-border bg-card panel-enter panel-shadow transition-colors">
          {/* Drag handle — covers only the title bar height (~44px), shows grab cursor */}
          {handleListeners && (
            <div
              {...handleListeners}
              className="absolute inset-x-0 top-0 h-11 z-[5] cursor-grab active:cursor-grabbing"
              aria-label={`Drag ${PANEL_LABELS[id]}`}
            />
          )}
          {children}
        </div>
      </div>
    );
  }

  function panelContent(id: PanelId, handleListeners?: React.HTMLAttributes<HTMLDivElement>) {
    switch (id) {
      case 'log': return panelCard(id, <RawWorkLog date={date} isDemo={isDemo} onRegisterInsert={(fn) => { insertAtCursorRef.current = fn; }} />, handleListeners);
      case 'todos': return panelCard(id, <TodoList date={date} isDemo={isDemo} />, handleListeners);
      case 'prs': return panelCard(id, <MyPRs isDemo={isDemo} onInsert={(text) => insertAtCursorRef.current?.(text)} />, handleListeners);
      case 'issues': return panelCard(id, <MyIssues isDemo={isDemo} onInsert={(text) => insertAtCursorRef.current?.(text)} />, handleListeners);
      case 'notifs': return panelCard(id, <GitHubNotifications refreshTrigger={notifsKey} isDemo={isDemo} onInsert={(text) => insertAtCursorRef.current?.(text)} />, handleListeners);
      case 'sessions': return panelCard(id, <AgentSessions isDemo={isDemo} onInsert={(text) => insertAtCursorRef.current?.(text)} />, handleListeners);
    }
  }

  function renderPanels() {
    const visible = panelOrder.filter((id) => visiblePanels.has(id));
    if (visible.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          All panels hidden — use <button onClick={() => setPanelMenuOpen(true)} className="mx-1 inline-flex items-center gap-0.5 underline hover:text-foreground"><Menu className="h-3.5 w-3.5" aria-hidden="true" /></button> to show them
        </div>
      );
    }

    if (layout === 'column') {
      const minHeightPx = visible.length * 400;
      return (
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={visible} strategy={verticalListSortingStrategy}>
            <div className="overflow-y-auto flex-1 min-h-0">
              <PanelGroup key={`col-${visible.join(',')}`} orientation="vertical" className="p-3" style={{ height: '100%', minHeight: minHeightPx }}>
                {visible.map((id, i) => (
                  <Fragment key={id}>
                    {i > 0 && <PanelResizeHandle className="my-1 h-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />}
                    <Panel defaultSize={100 / visible.length} minSize="150px">
                      <SortablePanelWrapper id={id} isDragging={activeDragId === id}>
                        {(dragHandleProps) => panelContent(id, dragHandleProps)}
                      </SortablePanelWrapper>
                    </Panel>
                  </Fragment>
                ))}
              </PanelGroup>
            </div>
          </SortableContext>
          <DragOverlay>
            {activeDragId ? (
              <div className="rounded-2xl border border-primary/40 bg-card shadow-2xl opacity-90 h-16 flex items-center px-4 text-sm font-semibold text-foreground">
                ⠿ {PANEL_LABELS[activeDragId]}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      );
    }

    // Grid layout: derive left/right from panelSide, respecting panelOrder
    const leftPanels = visible.filter((id) => panelSide[id] === 'left');
    const rightPanels = visible.filter((id) => panelSide[id] === 'right');

    function renderGridColumn(panels: PanelId[]) {
      if (panels.length === 0) return null;
      if (panels.length === 1) {
        return (
          <SortablePanelWrapper id={panels[0]} isDragging={activeDragId === panels[0]}>
            {(handleListeners) => panelContent(panels[0], handleListeners)}
          </SortablePanelWrapper>
        );
      }
      return (
        <PanelGroup orientation="vertical">
          {panels.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && <PanelResizeHandle className="my-1 h-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />}
              <Panel defaultSize={100 / panels.length} minSize={15}>
                <SortablePanelWrapper id={id} isDragging={activeDragId === id}>
                  {(handleListeners) => panelContent(id, handleListeners)}
                </SortablePanelWrapper>
              </Panel>
            </Fragment>
          ))}
        </PanelGroup>
      );
    }

    // Single SortableContext with ALL visible panels so cross-column drag works.
    // Column assignment is purely visual (panelSide); dnd-kit doesn't need to
    // know about columns — it just needs to find the closest drop target.
    const gridContent = leftPanels.length === 0 ? (
      <PanelGroup key={`grid-r-${rightPanels.join(',')}`} orientation="vertical" className="min-h-0 flex-1 p-3">
        {rightPanels.map((id, i) => (
          <Fragment key={id}>
            {i > 0 && <PanelResizeHandle className="my-1 h-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />}
            <Panel defaultSize={100 / rightPanels.length} minSize={15}>
              <SortablePanelWrapper id={id} isDragging={activeDragId === id}>
                {(handleListeners) => panelContent(id, handleListeners)}
              </SortablePanelWrapper>
            </Panel>
          </Fragment>
        ))}
      </PanelGroup>
    ) : rightPanels.length === 0 ? (
      <PanelGroup key={`grid-l-${leftPanels.join(',')}`} orientation="vertical" className="min-h-0 flex-1 p-3">
        {leftPanels.map((id, i) => (
          <Fragment key={id}>
            {i > 0 && <PanelResizeHandle className="my-1 h-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />}
            <Panel defaultSize={100 / leftPanels.length} minSize={15}>
              <SortablePanelWrapper id={id} isDragging={activeDragId === id}>
                {(handleListeners) => panelContent(id, handleListeners)}
              </SortablePanelWrapper>
            </Panel>
          </Fragment>
        ))}
      </PanelGroup>
    ) : (
      <PanelGroup key={`grid-${visible.join(',')}`} orientation="horizontal" className="min-h-0 flex-1 p-3">
        <Panel defaultSize={55} minSize={30}>
          {renderGridColumn(leftPanels)}
        </Panel>
        <PanelResizeHandle className="mx-1 w-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />
        <Panel defaultSize={45} minSize={25}>
          {renderGridColumn(rightPanels)}
        </Panel>
      </PanelGroup>
    );

    return (
      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <SortableContext items={visible} strategy={verticalListSortingStrategy}>
          {gridContent}
        </SortableContext>
        {renderDragOverlay()}
      </DndContext>
    );
  }

  function renderDragOverlay() {
    return (
      <DragOverlay>
        {activeDragId ? (
          <div className="rounded-2xl border border-primary/40 bg-card shadow-2xl opacity-90 h-16 flex items-center px-4 text-sm font-semibold text-foreground">
            ⠿ {PANEL_LABELS[activeDragId]}
          </div>
        ) : null}
      </DragOverlay>
    );
  }
}

// ── Sortable panel wrapper ────────────────────────────────────────────────────
function SortablePanelWrapper({
  id,
  isDragging,
  children,
}: {
  id: string;
  isDragging: boolean;
  children: (handleListeners: React.HTMLAttributes<HTMLDivElement>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    height: '100%',
    opacity: isDragging ? 0.35 : 1,
  };

  // Only listeners go on the grip handle; attributes (aria) go on the container.
  const handleListeners: React.HTMLAttributes<HTMLDivElement> = listeners ?? {};

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(handleListeners)}
    </div>
  );
}
