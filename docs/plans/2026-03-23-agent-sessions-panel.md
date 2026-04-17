# Agent Sessions Panel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "Agent Sessions" panel that reads Copilot CLI session history from `~/.copilot/session-store.db` and lets the user insert session summaries into their work log.

**Architecture:** A new `AgentSessions` component reads from a new `GET /api/sessions` route. The route opens the local SQLite DB with `better-sqlite3` (read-only), queries sessions with turn/file counts and linked refs, and returns JSON. The component follows the same cache + polling + insert pattern as `MyPRs` and `GitHubNotifications`.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS v4, `better-sqlite3`, `@types/better-sqlite3`, Lucide icons

---

## Task 1: Create branch and install dependency

**Files:**
- No code files, just shell commands

**Step 1: Create and switch to feature branch**
```bash
git checkout -b agent-sessions-panel
```

**Step 2: Install better-sqlite3**
```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

**Step 3: Verify build still passes**
```bash
npm run build
```
Expected: Build succeeds with no errors.

**Step 4: Commit**
```bash
git add package.json package-lock.json
git commit -m "chore: add better-sqlite3 for session store access"
```

---

## Task 2: Create the API route `/api/sessions`

**Files:**
- Create: `src/app/api/sessions/route.ts`

**Data shape** — define this type at the top of the file:
```ts
export type AgentSession = {
  id: string;
  repository: string;       // e.g. "therzka/git-stuff-done"
  branch: string;
  summary: string;
  createdAt: string;        // ISO string
  updatedAt: string;
  turnCount: number;
  fileCount: number;
  refs: { type: string; value: string }[];
};
```

**Step 1: Create the route file**

```ts
import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

export type AgentSession = {
  id: string;
  repository: string;
  branch: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  fileCount: number;
  refs: { type: string; value: string }[];
};

const DB_PATH = path.join(os.homedir(), '.copilot', 'session-store.db');

export async function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

    const rows = db.prepare(`
      SELECT
        s.id,
        s.repository,
        s.branch,
        s.summary,
        s.created_at   AS createdAt,
        s.updated_at   AS updatedAt,
        COUNT(DISTINCT t.turn_index) AS turnCount,
        COUNT(DISTINCT sf.file_path) AS fileCount,
        GROUP_CONCAT(DISTINCT sr.ref_type || ':' || sr.ref_value) AS refsRaw
      FROM sessions s
      LEFT JOIN turns t  ON t.session_id  = s.id
      LEFT JOIN session_files sf ON sf.session_id = s.id
      LEFT JOIN session_refs sr  ON sr.session_id  = s.id
      WHERE s.summary IS NOT NULL
        AND s.summary NOT LIKE 'You are a helpful assistant%'
        AND length(trim(s.summary)) > 0
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 50
    `).all() as Array<{
      id: string;
      repository: string;
      branch: string;
      summary: string;
      createdAt: string;
      updatedAt: string;
      turnCount: number;
      fileCount: number;
      refsRaw: string | null;
    }>;

    db.close();

    const sessions: AgentSession[] = rows.map((row) => ({
      id: row.id,
      repository: row.repository ?? '',
      branch: row.branch ?? '',
      summary: row.summary,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      turnCount: row.turnCount ?? 0,
      fileCount: row.fileCount ?? 0,
      refs: row.refsRaw
        ? row.refsRaw.split(',').map((r) => {
            const [type, ...rest] = r.split(':');
            return { type, value: rest.join(':') };
          })
        : [],
    }));

    console.log(`[sessions] Returning ${sessions.length} sessions`);
    return NextResponse.json(sessions);
  } catch (err) {
    console.error('[sessions] Failed to read session store:', err);
    return NextResponse.json([]);
  }
}
```

**Step 2: Verify build**
```bash
npm run build
```
Expected: Builds successfully.

**Step 3: Test the route manually**
Start dev server (`npm run dev`) and run:
```bash
curl http://localhost:3000/api/sessions | head -c 500
```
Expected: JSON array with session objects.

**Step 4: Commit**
```bash
git add src/app/api/sessions/route.ts
git commit -m "feat: add GET /api/sessions route reading from session-store.db"
```

---

## Task 3: Create the `AgentSessions` component

**Files:**
- Create: `src/components/AgentSessions.tsx`

This component follows the same structure as `GitHubNotifications.tsx`. Key differences:
- No demo mode (show empty state instead)
- Groups sessions by relative date bucket
- Insert format: `[{summary}](https://github.com/{repository}/tree/{branch})`

**Step 1: Create the component**

```tsx
'use client';

import { useCallback, useRef, useState } from 'react';
import { Bot, GitBranch } from 'lucide-react';
import { useVisibilityPolling } from '@/hooks/useVisibilityPolling';
import type { AgentSession } from '@/app/api/sessions/route';

// Module-level cache to survive remounts (e.g. layout switches)
let _sessionCache: AgentSession[] | null = null;

function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function dateBucket(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'This Week';
  return 'Older';
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'This Week', 'Older'];

function groupByDate(sessions: AgentSession[]): [string, AgentSession[]][] {
  const groups: Record<string, AgentSession[]> = {};
  for (const s of sessions) {
    const bucket = dateBucket(s.createdAt);
    (groups[bucket] ??= []).push(s);
  }
  return BUCKET_ORDER.filter((b) => groups[b]).map((b) => [b, groups[b]]);
}

function insertText(session: AgentSession): string {
  const url = session.repository
    ? `https://github.com/${session.repository}/tree/${session.branch}`
    : '';
  return url ? `[${session.summary}](${url})` : session.summary;
}

export default function AgentSessions({
  isDemo = false,
  onInsert,
}: {
  isDemo?: boolean;
  onInsert?: (text: string) => void;
}) {
  const [sessions, setSessions] = useState<AgentSession[]>(_sessionCache ?? []);
  const [loading, setLoading] = useState(_sessionCache === null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (isDemo) {
      setLoading(false);
      return;
    }
    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch('/api/sessions', { signal: controller.signal });
      const data: AgentSession[] = await res.json();
      setSessions(data);
      _sessionCache = data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useVisibilityPolling(refresh, 5 * 60_000);

  const groups = groupByDate(sessions);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-base font-semibold text-primary flex items-center gap-2">
          <Bot className="h-4 w-4" aria-hidden="true" />
          Agent Sessions
        </span>
        <span className="text-xs text-muted-foreground">
          {sessions.length > 0 ? `${sessions.length} sessions` : ''}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 space-y-1.5 animate-pulse">
                <div className="h-3.5 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground px-6 text-center">
            {isDemo ? 'Agent Sessions not available in demo mode.' : 'No sessions found.'}
          </div>
        )}

        {!loading && groups.map(([bucket, items]) => (
          <div key={bucket}>
            <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/40 border-b border-border sticky top-0">
              {bucket}
            </div>
            <ul className="divide-y divide-border">
              {items.map((session) => {
                const repoName = session.repository.split('/')[1] ?? session.repository;
                const prRefs = session.refs.filter((r) => r.type === 'pr');
                const commitRefs = session.refs.filter((r) => r.type === 'commit');

                return (
                  <li
                    key={session.id}
                    className="group px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start gap-2">
                      {onInsert && (
                        <button
                          onClick={() => onInsert(insertText(session))}
                          title="Insert link at cursor"
                          aria-label={`Insert link for "${session.summary}"`}
                          className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                            <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
                          </svg>
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate leading-snug">
                          {session.summary}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          {repoName && (
                            <span className="flex items-center gap-1">
                              <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate max-w-[140px]">{repoName}</span>
                              {session.branch && (
                                <span className="text-muted-foreground/60 truncate max-w-[100px]">
                                  / {session.branch}
                                </span>
                              )}
                            </span>
                          )}
                          <span>{timeAgo(session.createdAt)}</span>
                          {session.turnCount > 0 && (
                            <span className="tabular-nums">{session.turnCount} turns</span>
                          )}
                          {prRefs.length > 0 && (
                            <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20 tabular-nums">
                              {prRefs.length} PR{prRefs.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {commitRefs.length > 0 && (
                            <span className="rounded-full bg-zinc-50 px-1.5 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-400 dark:ring-zinc-500/20 tabular-nums">
                              {commitRefs.length} commit{commitRefs.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**
```bash
npm run build
```
Expected: No TypeScript errors.

**Step 3: Commit**
```bash
git add src/components/AgentSessions.tsx
git commit -m "feat: add AgentSessions panel component"
```

---

## Task 4: Wire into Dashboard

**Files:**
- Modify: `src/components/Dashboard.tsx`

Make four small edits — **do all four before committing:**

**Edit 1:** Add import at the top of Dashboard.tsx (after other panel imports):
```ts
import AgentSessions from './AgentSessions';
```

**Edit 2:** Extend `PanelId` type (line ~20):
```ts
// Before:
type PanelId = 'log' | 'todos' | 'prs' | 'issues' | 'notifs';
// After:
type PanelId = 'log' | 'todos' | 'prs' | 'issues' | 'notifs' | 'sessions';
```

**Edit 3:** Add to `PANEL_LABELS` and `ALL_PANELS` (lines ~23-30):
```ts
// In PANEL_LABELS, add:
sessions: 'Agent Sessions',

// In ALL_PANELS, add 'sessions':
const ALL_PANELS: PanelId[] = ['log', 'todos', 'prs', 'issues', 'notifs', 'sessions'];
```

**Edit 4:** Add case to `panelContent()` (after `case 'notifs'`):
```ts
case 'sessions': return panelCard(id, <AgentSessions isDemo={isDemo} onInsert={(text) => insertAtCursorRef.current?.(text)} />);
```

**Step 1: Apply all four edits.**

**Step 2: Verify build**
```bash
npm run build
```
Expected: Builds successfully with no TS errors.

**Step 3: Spot-check in browser**
```bash
npm run dev
```
- Open http://localhost:3000
- Verify "Agent Sessions" appears in the panel show/hide menu
- Toggle it on — should show the sessions list
- Hover a session row — insert button should appear
- Click insert — session link should appear at cursor in Work Log

**Step 4: Commit**
```bash
git add src/components/Dashboard.tsx
git commit -m "feat: wire AgentSessions panel into Dashboard"
```

---

## Task 5: Update README

**Files:**
- Modify: `README.md`

Add a bullet under the dashboard panels section describing the Agent Sessions panel. Mention: reads from `~/.copilot/session-store.db`, shows recent Copilot CLI sessions grouped by date, hover-to-insert into work log.

**Step 1: Add the description** (find the panels section and add the new panel).

**Step 2: Commit**
```bash
git add README.md
git commit -m "docs: add Agent Sessions panel to README"
```

---

## Task 6: Update CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

Add entry under `[Unreleased]` section:

```markdown
### Added
- Agent Sessions panel: shows recent Copilot CLI sessions from `~/.copilot/session-store.db`,
  grouped by date (Today / Yesterday / This Week / Older), with turn count, file count,
  and linked PR/commit badges; hover to insert session summary link into work log
```

**Step 1: Add the changelog entry.**

**Step 2: Commit**
```bash
git add CHANGELOG.md
git commit -m "docs: add Agent Sessions panel to CHANGELOG"
```

---

## Task 7: Push and open PR

```bash
git push -u origin agent-sessions-panel
gh pr create --title "feat: Agent Sessions panel" \
  --body "Adds a new panel showing Copilot CLI session history from ~/.copilot/session-store.db.

## What
- New \`GET /api/sessions\` route reads local SQLite DB with \`better-sqlite3\`
- New \`AgentSessions\` component: grouped by date, turn/file/PR counts, hover-to-insert
- Wired into Dashboard as a toggleable panel

## How to test
1. Open the dashboard
2. Enable the Agent Sessions panel from the panel menu
3. Verify sessions appear grouped by date
4. Hover a row and click the insert button — link should appear in Work Log"
```
