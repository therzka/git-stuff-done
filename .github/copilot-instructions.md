# Copilot Instructions

This is git-stuff-done — a personal daily work log dashboard built with Next.js 16, TypeScript, and Tailwind CSS v4.

## Architecture
- 4-panel dashboard: Work Log editor, TODO list, My PRs, GitHub Notifications
- File-based storage: `logs/YYYY-MM-DD.md`, `data/todos.json`, `data/config.json` (settings)
- Linkify replaces bare GitHub URLs with titled markdown links (deterministic, no AI)
- AI features (summaries, todo suggestions) via `@github/copilot-sdk` (requires Copilot CLI); summary generation uses a user-selectable model
- Merge queue status fetched via GitHub GraphQL API (`mergeQueueEntry`)
- Hourly auto-commit of logs, summaries, and todos to git
- GitHub data (PRs, notifications) via Octokit REST API
- Shared hooks in `src/hooks/` (e.g. `useVisibilityPolling`)

## Conventions
- Full light + dark theme via CSS variables in `globals.css`; use semantic tokens (`bg-background`, `text-foreground`, `bg-card`, etc.) not hardcoded zinc/violet classes
- API routes are in `src/app/api/`
- Shared utilities in `src/lib/`
- Client components use `'use client'` directive
- Overlays/popovers must use `createPortal(el, document.body)` with `position: fixed` and `z-index: 9999` to escape panel stacking contexts
- Polling components use `useVisibilityPolling` (pauses when tab is hidden) and AbortController to cancel stale requests
- Data-fetching components (MyPRs, GitHubNotifications) use module-level caches to survive remounts during layout switches
- Cross-panel communication (e.g. insert-at-cursor) uses a callback ref registration pattern via `onRegisterXxx` props
- Layout (grid/column) and panel visibility are persisted to localStorage (`gsd-layout`, `gsd-visible-panels`)
- Auto-switches to column layout on narrow viewports (<1024px)

## Dependency Management
- Local dev environment: **Node 25 / npm 11** (`node -v` → v25.x, `npm -v` → 11.x)
- CI uses Node 22 + upgrades npm to latest before running `npm ci` (both `deploy.yml` and `demo.yml`)
- **Always commit `package-lock.json`** after any `npm install`, `npm remove`, or `npm update` — CI runs `npm ci` which will fail if the lock file is stale or missing entries
- Never use `--no-package-lock`; the lock file must always reflect the current dependency tree
- If CI fails with "npm ci can only install packages when package.json and package-lock.json are in sync", re-run `npm install` locally and commit the updated lock file

## Custom Instructions
- Always update the README.md file when you add or modify features to keep the documentation in sync with the code.
