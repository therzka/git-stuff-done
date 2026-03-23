# Design: Agent Sessions Panel

**Date:** 2026-03-23  
**Status:** Approved

## Problem

The dashboard has no visibility into Copilot CLI session history. Developers want to see what AI-assisted work they did recently and quickly insert a session summary link into their work log.

## Approach

Add a new "Agent Sessions" panel to the existing 4-panel dashboard. It reads from the local `~/.copilot/session-store.db` SQLite database and renders sessions in a scrollable list, consistent with the MyPRs/GitHubNotifications panel style.

## Data Source

**File:** `~/.copilot/session-store.db`  
**Library:** `better-sqlite3` (new dependency — synchronous SQLite, no extra server needed, works well in Next.js API routes)

**Query:** Join `sessions` + `turns` (for count) + `session_refs` (for linked PRs/commits). Filter out sessions with null or garbled summaries (summaries starting with "You are a helpful assistant"). Limit to 50 most recent.

**Shape returned per session:**
```ts
type AgentSession = {
  id: string;
  repository: string;       // e.g. "therzka/git-stuff-done"
  branch: string;
  summary: string;
  createdAt: string;        // ISO string
  updatedAt: string;
  turnCount: number;
  fileCount: number;
  refs: { type: 'commit' | 'pr' | 'issue'; value: string }[];
}
```

## Architecture

### API Route
`GET /api/sessions`
- Opens session-store.db with `better-sqlite3` in read-only mode
- Runs a single JOIN query returning sessions with aggregated turn/file counts and serialized refs
- Returns `AgentSession[]` JSON; returns `[]` on error (e.g. DB not found)

### New Component
`src/components/AgentSessions.tsx`
- Props: `{ isDemo?: boolean; onInsert?: (text: string) => void }`
- Module-level cache `let _sessionCache: AgentSession[] | null = null`
- Fetches on mount, polls every 5 minutes via `useVisibilityPolling`
- Abort controller per request to avoid stale responses
- Groups sessions by relative date bucket: Today / Yesterday / This Week / Older
- Each session row shows:
  - Summary (bold)
  - `{repoName} / {branch}` in muted text
  - Turn count badge
  - Linked PR or commit count badges (if any)
  - Hover-to-insert button (only if `onInsert` prop is set)
- Insert format: `[{summary}](https://github.com/{repository}/tree/{branch})`
- Loading state: skeleton rows
- Empty state: "No sessions found"

### Dashboard Integration
- Add `'sessions'` to `PanelId` union
- Add to `PANEL_LABELS`, `ALL_PANELS`
- Add `case 'sessions'` to `panelContent()` with `onInsert` wired to `insertAtCursorRef`

## Out of Scope
- Clicking into a session to see turns/checkpoints (future)
- Filtering by repo (future)
- Demo mode (no reasonable fake data; hide panel in demo or show empty state)
