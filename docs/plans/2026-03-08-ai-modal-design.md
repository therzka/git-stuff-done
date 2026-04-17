# Design: Combined AI Modal

## Problem

`SearchModal.tsx` and `SummaryModal.tsx` are two separate modals sharing ~70% identical structure (shell, model selector, error/loading/demo states). They clutter the toolbar with two buttons and force users to think of them as separate tools rather than a unified AI assistant.

## Goals

1. **DRY** — eliminate duplicated modal chrome, model selector, error handling
2. **Simpler toolbar** — single ✨ AI button with a dropdown (Search Logs / Generate Summary)
3. **Unified UX** — one "AI assistant" modal with tabs, not two separate features

## Approach: Tabbed modal with shared shell

### Component Structure

```
AiModal.tsx
├── Modal shell (backdrop, panel, Escape handler)
├── Header: "AI Assistant" + tab bar [Search | Summarize] + close button
├── Shared: model selector dropdown (persists across tabs)
├── Tab content (toggled via `hidden` class for state preservation):
│   ├── SearchPane: question textarea, loading/progress, keep-searching, result
│   └── SummarizePane: date range, prompt template, instructions, result
├── Footer: adapts per active tab
│   ├── Search: [Copy] ... [Search]
│   └── Summarize: [Copy] [Download .md] [Save & Commit] ... [Generate Summary]
```

### State Management

- Each pane manages its own state independently (`useState` per pane)
- Switching tabs toggles visibility via `hidden` CSS class — state preserved
- Model selector is shared state at the AiModal level
- Closing the modal resets all pane state

### Toolbar Dropdown

- Single ✨ AI button in the Dashboard toolbar
- Click opens a small popover (portal to `document.body`, `position: fixed`)
- Two items: 🔍 Search Logs / 📊 Generate Summary
- Clicking an item opens the modal on that tab, closes the dropdown
- Escape or click-outside closes the dropdown

### Dashboard Integration

- `aiModalTab: 'search' | 'summarize' | null` replaces `showSearch` + `showSummary`
- `null` = modal closed
- Setting a value opens the modal on that tab

### API Routes (unchanged)

- `/api/search` — iterative windowed search
- `/api/summary` — date-range summary generation
- `/api/summary/save` — commit summary to repo

### Files Changed

- **Create** `src/components/AiModal.tsx`
- **Edit** `src/components/Dashboard.tsx` — replace two modals/buttons with AiModal + dropdown
- **Delete** `src/components/SearchModal.tsx`
- **Delete** `src/components/SummaryModal.tsx`

### Rejected Alternatives

- **Slot pattern wrapper** — over-engineered for two modes; footer adaptation is awkward
- **Shared hook + keep two files** — doesn't achieve unified UX or toolbar simplification
