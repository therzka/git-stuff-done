'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { useSearchParams } from 'next/navigation';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { Upload, Moon, Sun, BarChart2, Search, Settings, LayoutGrid, AlignJustify, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';
import RawWorkLog from './RawWorkLog';
import TodoList from './TodoList';
import MyPRs from './MyPRs';
import MyIssues from './MyIssues';
import GitHubNotifications from './GitHubNotifications';
import SummaryModal from './SummaryModal';
import SearchModal from './SearchModal';
import CalendarPicker from './CalendarPicker';
import { GITHUB_ORG } from '@/lib/constants';

type PanelId = 'log' | 'todos' | 'prs' | 'issues' | 'notifs';
type LayoutMode = 'grid' | 'column';

const PANEL_LABELS: Record<PanelId, string> = {
  log: 'Work Log',
  todos: 'TODOs',
  prs: 'My PRs',
  issues: 'My Issues',
  notifs: 'Notifications',
};
const ALL_PANELS: PanelId[] = ['log', 'todos', 'prs', 'issues', 'notifs'];

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
  return new Set(ALL_PANELS);
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

export default function Dashboard() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === 'true' || process.env.NEXT_PUBLIC_DEMO === 'true';

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO);
  const [showSummary, setShowSummary] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const insertAtCursorRef = useRef<((text: string) => void) | null>(null);

  // Layout & panel visibility
  const [layout, setLayout] = useState<LayoutMode>(loadLayout);
  const [visiblePanels, setVisiblePanels] = useState<Set<PanelId>>(loadVisiblePanels);
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  const panelMenuBtnRef = useRef<HTMLButtonElement>(null);
  const panelMenuRef = useRef<HTMLDivElement>(null);
  const [panelMenuPos, setPanelMenuPos] = useState({ top: 0, left: 0 });

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

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setIgnoredRepos(data.ignoredRepos ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  async function saveIgnoredRepos(repos: string[]) {
    setIgnoredRepos(repos);
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ignoredRepos: repos }),
    });
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
    setCommitting(true);
    try {
      const res = await fetch('/api/commit', { method: 'POST' });
      const data = await res.json();
      if (data.committed) {
        setCommitMsg('✓ Committed');
      } else {
        setCommitMsg(data.message || 'Nothing to commit');
      }
      setTimeout(() => setCommitMsg(null), 3000);
    } catch {
      setCommitMsg('Commit failed');
      setTimeout(() => setCommitMsg(null), 3000);
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground transition-colors duration-300">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-4 py-2 sm:px-6 sm:py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-x-2">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold tracking-tight text-primary sm:text-xl">git stuff done</span>
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
          {commitMsg && (
            <span className="text-xs text-primary font-medium">{commitMsg}</span>
          )}
          <button
            onClick={handleCommit}
            disabled={committing || isDemo}
            title={isDemo ? 'Disabled in demo mode' : 'Push to GitHub'}
            className="rounded-xl bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50 sm:px-4 sm:text-sm"
          >
            {committing ? '…' : <><Upload className="h-3.5 w-3.5 sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">Commit &amp; Push</span></>}
          </button>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Toggle Theme"
          >
            {mounted ? (theme === 'dark' ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />) : <span className="h-4 w-4 inline-block" />}
          </button>
          <button
            onClick={() => setShowSummary(true)}
            className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Summarize"
            title="Generate Summary"
          >
            <BarChart2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setShowSearch(true)}
            className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Search"
            title="Search Work Logs"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
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

      <SummaryModal
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        defaultDate={date}
        isDemo={isDemo}
      />

      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
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
        </div>
      )}

      {/* Panel layout */}
      {renderPanels()}
    </div>
  );

  function panelCard(id: PanelId, children: React.ReactNode) {
    return (
      <div className="group/card relative h-full">
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
          {children}
        </div>
      </div>
    );
  }

  function panelContent(id: PanelId) {
    switch (id) {
      case 'log': return panelCard(id, <RawWorkLog date={date} isDemo={isDemo} onRegisterInsert={(fn) => { insertAtCursorRef.current = fn; }} />);
      case 'todos': return panelCard(id, <TodoList date={date} isDemo={isDemo} />);
      case 'prs': return panelCard(id, <MyPRs isDemo={isDemo} onInsert={(text) => insertAtCursorRef.current?.(text)} />);
      case 'issues': return panelCard(id, <MyIssues isDemo={isDemo} onInsert={(text) => insertAtCursorRef.current?.(text)} />);
      case 'notifs': return panelCard(id, <GitHubNotifications refreshTrigger={notifsKey} isDemo={isDemo} onInsert={(text) => insertAtCursorRef.current?.(text)} />);
    }
  }

  function renderPanels() {
    const visible = ALL_PANELS.filter((id) => visiblePanels.has(id));
    const panelKey = visible.join(',');
    if (visible.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          All panels hidden — use <button onClick={() => setPanelMenuOpen(true)} className="mx-1 inline-flex items-center gap-0.5 underline hover:text-foreground"><Menu className="h-3.5 w-3.5" aria-hidden="true" /></button> to show them
        </div>
      );
    }

    if (layout === 'column') {
      return (
        <PanelGroup key={`col-${visible.join(',')}`} orientation="vertical" className="min-h-0 flex-1 p-3">
          {visible.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && <PanelResizeHandle className="my-1 h-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />}
              <Panel defaultSize={100 / visible.length} minSize={10}>
                {panelContent(id)}
              </Panel>
            </Fragment>
          ))}
        </PanelGroup>
      );
    }

    // Grid layout: left column (log, todos), right column (prs, notifs)
    const leftPanels = (['log', 'todos'] as PanelId[]).filter((id) => visiblePanels.has(id));
    const rightPanels = (['prs', 'issues', 'notifs'] as PanelId[]).filter((id) => visiblePanels.has(id));

    // If one side is empty, show only the other
    if (leftPanels.length === 0 && rightPanels.length > 0) {
      return (
        <PanelGroup key={`grid-r-${rightPanels.join(',')}`} orientation="vertical" className="min-h-0 flex-1 p-3">
          {rightPanels.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && <PanelResizeHandle className="my-1 h-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />}
              <Panel defaultSize={100 / rightPanels.length} minSize={15}>
                {panelContent(id)}
              </Panel>
            </Fragment>
          ))}
        </PanelGroup>
      );
    }
    if (rightPanels.length === 0 && leftPanels.length > 0) {
      return (
        <PanelGroup key={`grid-l-${leftPanels.join(',')}`} orientation="vertical" className="min-h-0 flex-1 p-3">
          {leftPanels.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && <PanelResizeHandle className="my-1 h-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />}
              <Panel defaultSize={100 / leftPanels.length} minSize={15}>
                {panelContent(id)}
              </Panel>
            </Fragment>
          ))}
        </PanelGroup>
      );
    }

    return (
      <PanelGroup key={`grid-${visible.join(',')}`} orientation="horizontal" className="min-h-0 flex-1 p-3">
        <Panel defaultSize={55} minSize={30}>
          {leftPanels.length === 1 ? (
            panelContent(leftPanels[0])
          ) : (
            <PanelGroup orientation="vertical">
              {leftPanels.map((id, i) => (
                <Fragment key={id}>
                  {i > 0 && <PanelResizeHandle className="my-1 h-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />}
                  <Panel defaultSize={i === 0 ? 60 : 40} minSize={15}>
                    {panelContent(id)}
                  </Panel>
                </Fragment>
              ))}
            </PanelGroup>
          )}
        </Panel>
        <PanelResizeHandle className="mx-1 w-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />
        <Panel defaultSize={45} minSize={25}>
          {rightPanels.length === 1 ? (
            panelContent(rightPanels[0])
          ) : (
            <PanelGroup orientation="vertical">
              {rightPanels.map((id, i) => (
                <Fragment key={id}>
                  {i > 0 && <PanelResizeHandle className="my-1 h-1.5 rounded-full transition hover:bg-accent active:bg-primary/50" />}
                  <Panel defaultSize={50} minSize={15}>
                    {panelContent(id)}
                  </Panel>
                </Fragment>
              ))}
            </PanelGroup>
          )}
        </Panel>
      </PanelGroup>
    );
  }
}
