# Copilot Instructions

This is git-stuff-done — a personal daily work log dashboard built with Next.js 16, TypeScript, and Tailwind CSS v4.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Full build + TypeScript type check (use to verify changes)
npm run lint     # ESLint
```

There are no automated tests. The `playwright` package is installed but has no test scripts configured.

## Architecture

**Panels:** Dashboard (`src/components/Dashboard.tsx`) orchestrates 6 panels (`log`, `todos`, `prs`, `issues`, `notifs`, `sessions`) rendered via `react-resizable-panels`. Panels are draggable via `@dnd-kit`. Panel visibility and positions are persisted to `localStorage`.

**Storage:** File-based. All data lives under `GIT_STUFF_DONE_DATA_DIR` (defaults to repo root):
- `logs/YYYY-MM-DD.md` — daily work logs
- `attachments/YYYY-MM-DD/` — images pasted into logs
- `summaries/YYYY-MM-DD-{type}.md` — AI-generated summaries
- `data/todos.json` — TODO items
- `data/config.json` — settings (ignored repos, font size)

**Editor:** Tiptap (ProseMirror) rich text editor in `src/components/TiptapEditor.tsx`. Renders markdown inline as you type. Supports image drag-and-drop, `@mention` autocomplete for GitHub org members, and Slack thread preview on hover.

**AI features:** `@github/copilot-sdk` communicates with the Copilot CLI in server mode. Requires `copilot` CLI in PATH. Features include: work log summaries, TODO suggestions, natural language log search (NDJSON streaming), and dynamic model discovery (24-hour cache). AI features are disabled in demo mode.

**GitHub data:** Octokit REST API for PRs, issues, notifications. GraphQL for merge queue status (`mergeQueueEntry`). Token priority: `GITHUB_READ_TOKEN` → `GH_TOKEN` → `gh auth token`. `GITHUB_ORG` supports comma-separated values.

**Auto-commit:** `src/lib/scheduler.ts` commits and pushes `logs/`, `summaries/`, `attachments/`, and `data/` every hour.

**Timezone:** All dates hardcoded to `America/Los_Angeles` in `getTodayDate()` in `src/lib/files.ts`.

## Conventions

**Theming:** CSS variables in `globals.css` use OKLCH color space. Always use semantic tokens (`bg-background`, `text-foreground`, `bg-card`, `bg-muted`, `text-muted-foreground`, etc.) — never hardcode zinc/violet/purple classes. Font size scaling uses a `--text-scale` CSS variable applied across all `--text-*` tokens.

**Overlays/Popovers:** Must use `createPortal(el, document.body)` with `position: fixed` and `z-index: 9999` to escape panel stacking contexts.

**Polling:** Use `useVisibilityPolling` hook (pauses when tab is hidden, fires immediately on tab focus). Always pair with `AbortController` to cancel stale in-flight requests.

**Module-level caches:** Data-fetching components (`MyPRs`, `GitHubNotifications`, `MyIssues`) use module-level variables (outside React state) to cache API responses across remounts during layout switches.

**Cross-panel communication:** Insert-at-cursor and similar cross-panel actions use a callback ref registration pattern: the editor registers a callback via an `onRegisterXxx` prop, and other panels call it directly.

**Path safety:** `isValidDate()` in `src/lib/files.ts` validates `YYYY-MM-DD` format before constructing file paths — always use it in API routes that accept date params.

**Client vs server:** All components are client components (`'use client'`) except API routes. API routes live in `src/app/api/`. Shared utilities in `src/lib/`. Shared hooks in `src/hooks/`.

## Dependency Management

- Local dev environment: **Node 25 / npm 11** (`node -v` → v25.x, `npm -v` → 11.x)
- CI uses Node 22 + upgrades npm to latest before running `npm ci`
- **Always commit `package-lock.json`** after any `npm install`, `npm remove`, or `npm update` — CI runs `npm ci` which will fail if the lock file is out of sync
- Never use `--no-package-lock`

## Documentation

Always update `README.md` when adding or modifying features.
