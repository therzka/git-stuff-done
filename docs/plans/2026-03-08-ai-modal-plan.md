# Combined AI Modal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge SearchModal and SummaryModal into a single tabbed AiModal with a toolbar dropdown entry point.

**Architecture:** Single `AiModal.tsx` with two panes (Search / Summarize) toggled via tabs. Each pane manages its own state; switching tabs uses `hidden` CSS class to preserve state. A dropdown on the toolbar button opens the modal on the selected tab. API routes are unchanged.

**Tech Stack:** React 19, Next.js 16, TypeScript, Tailwind CSS v4, lucide-react icons, `createPortal`

**Design doc:** `docs/plans/2026-03-08-ai-modal-design.md`

---

### Task 1: Create AiModal.tsx with shared shell and both panes

**Files:**
- Create: `src/components/AiModal.tsx`

**Step 1: Create the combined modal component**

Create `src/components/AiModal.tsx` with the full implementation. This combines all logic from `SearchModal.tsx` and `SummaryModal.tsx` into a single tabbed component.

Key structural elements:
- Props: `isOpen: boolean`, `onClose: () => void`, `defaultTab: 'search' | 'summarize'`, `defaultDate: string`, `isDemo?: boolean`
- Shared `MODELS` array (same as both originals)
- Shared model selector state at the top level
- `activeTab` state initialized from `defaultTab` prop (synced via `useEffect` when modal opens)
- Two pane sections, each wrapped in a `<div className={activeTab === 'x' ? '' : 'hidden'}>` for state preservation
- Search pane: all state and logic from `SearchModal.tsx` (query, loading, result, error, daysSearched, exhausted, canContinue, searchMode, abortRef, demo logic)
- Summarize pane: all state and logic from `SummaryModal.tsx` (startDate, endDate, customPrompt, loading, saving, result, error, DEFAULT_PROMPTS, demo logic, save/download/copy actions)
- Header: "AI Assistant" title + tab bar + close button
- Tab bar: two buttons styled as tabs with active/inactive states
- Footer: adapts based on `activeTab` — Search shows Copy + Search button; Summarize shows Copy + Download .md + Save & Commit + Generate Summary button
- `handleClose`: abort any in-progress search, reset ALL state for both panes, call `onClose`
- Escape handler via `useEffect` (same pattern as existing modals)
- Click-outside-to-close via `onMouseDown` on backdrop (same pattern)

The component must use the same design tokens and styling patterns as the existing modals:
- `bg-popover`, `ring-1 ring-border`, `rounded-2xl`, `shadow-xl`
- Labels: `text-xs font-medium text-muted-foreground uppercase tracking-wider`
- Inputs: `rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm`
- Primary button: `rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground`
- Secondary buttons: `rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted`
- Error: `text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20`

Tab styling:
- Active tab: `text-foreground border-b-2 border-primary font-medium`
- Inactive tab: `text-muted-foreground hover:text-foreground`
- Tab bar sits below the title row, separated by the header border

**Step 2: Verify it compiles**

Run: `npx next build --no-lint 2>&1 | head -20` (or `npx tsc --noEmit`)
Expected: No type errors related to AiModal

**Step 3: Commit**

```bash
git add src/components/AiModal.tsx
git commit -m "feat: create AiModal combining search and summary tabs

Single tabbed modal with shared shell, model selector, and
independent pane state. Preserves all functionality from both
SearchModal and SummaryModal.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Update Dashboard.tsx to use AiModal with toolbar dropdown

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Step 1: Update imports**

Replace:
```typescript
import SummaryModal from './SummaryModal';
import SearchModal from './SearchModal';
```
With:
```typescript
import AiModal from './AiModal';
```

Also add `Sparkles` to the lucide-react import (for the AI button icon). Remove `BarChart2` and `Search` from the import (they're no longer used in Dashboard — Search icon moves into AiModal).

**Step 2: Replace state variables**

Replace:
```typescript
const [showSummary, setShowSummary] = useState(false);
const [showSearch, setShowSearch] = useState(false);
```
With:
```typescript
const [aiModalTab, setAiModalTab] = useState<'search' | 'summarize' | null>(null);
const [aiMenuOpen, setAiMenuOpen] = useState(false);
const aiMenuBtnRef = useRef<HTMLButtonElement>(null);
const aiMenuRef = useRef<HTMLDivElement>(null);
const [aiMenuPos, setAiMenuPos] = useState({ top: 0, left: 0 });
```

**Step 3: Add click-outside handler for AI dropdown**

Add a `useEffect` that follows the same pattern as the existing `panelMenuOpen` handler (lines 105-116 in Dashboard.tsx):

```typescript
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
```

**Step 4: Replace toolbar buttons**

Replace the two buttons (Summary at line ~245, Search at line ~253) with a single AI button:

```tsx
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
```

**Step 5: Add AI dropdown portal**

Add the dropdown portal right after the existing panel menu portal (after the `panelMenuOpen` portal block, before the modal renders). Follow the exact same portal + fixed positioning pattern:

```tsx
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
```

Note: `Search` and `BarChart2` icons are still needed — keep them in the lucide import but they're now used in the dropdown, not as standalone toolbar buttons.

**Step 6: Replace modal renders**

Replace:
```tsx
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
```
With:
```tsx
<AiModal
  isOpen={aiModalTab !== null}
  onClose={() => setAiModalTab(null)}
  defaultTab={aiModalTab ?? 'search'}
  defaultDate={date}
  isDemo={isDemo}
/>
```

**Step 7: Verify it compiles and renders**

Run: `npx tsc --noEmit`
Expected: No type errors

Run: `npm run dev` and verify:
1. Single ✨ button in toolbar
2. Clicking opens dropdown with two options
3. Each option opens the modal on the correct tab
4. Tabs switch inside the modal
5. Both Search and Summarize flows work (use demo mode if no API)
6. Escape closes modal, click-outside closes dropdown
7. State preserved when switching tabs

**Step 8: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: wire AiModal into Dashboard with toolbar dropdown

Replace two separate modal buttons with a single AI button that
opens a dropdown (Search Logs / Generate Summary). Each opens
the combined AiModal on the selected tab.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Delete old modal files

**Files:**
- Delete: `src/components/SearchModal.tsx`
- Delete: `src/components/SummaryModal.tsx`

**Step 1: Verify no remaining imports**

Run: `grep -r 'SearchModal\|SummaryModal' src/ --include='*.tsx' --include='*.ts'`
Expected: No results (all references removed in Task 2)

**Step 2: Delete files**

```bash
rm src/components/SearchModal.tsx src/components/SummaryModal.tsx
```

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean — no missing module errors

**Step 4: Commit**

```bash
git add -u src/components/SearchModal.tsx src/components/SummaryModal.tsx
git commit -m "chore: remove SearchModal and SummaryModal (replaced by AiModal)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Update README.md

**Files:**
- Modify: `README.md`

**Step 1: Update feature descriptions**

Find any references to "Search" and "Summary" as separate features and update to describe the unified AI modal. Per project conventions, README must stay in sync with features.

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for combined AI modal

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
