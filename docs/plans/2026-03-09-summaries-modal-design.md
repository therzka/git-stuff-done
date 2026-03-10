# Summaries Browser Modal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a modal to browse, view, copy, and delete saved AI summaries from the `summaries/` directory.

**Architecture:** Three new API routes (list, read, delete) backed by the existing `summariesDir()` helper, plus a two-panel `SummariesModal` component with a `MarkdownViewer` for rich-text rendering. Triggered from a new toolbar button in Dashboard.

**Tech Stack:** Next.js App Router API routes, Tiptap (read-only) for markdown rendering, Lucide icons, existing `commitWorkLog()` for delete auto-commits.

---

### Task 1: Add `listSummaries()` and `readSummary()` helpers to `src/lib/files.ts`

**Files:**
- Modify: `src/lib/files.ts`

**Step 1: Add the helper functions**

At the bottom of `src/lib/files.ts`, add:

```typescript
export async function listSummaries(): Promise<string[]> {
  try {
    const files = await readdir(summariesDir());
    return files
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function readSummary(filename: string): Promise<string | null> {
  try {
    return await readFile(getSummaryPath(filename), 'utf-8');
  } catch {
    return null;
  }
}

export async function deleteSummary(filename: string): Promise<boolean> {
  try {
    await unlink(getSummaryPath(filename));
    return true;
  } catch {
    return false;
  }
}
```

Note: `readdir`, `readFile` are already imported. Add `unlink` to the existing import from `fs/promises`.

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully

**Step 3: Commit**

```bash
git add src/lib/files.ts
git commit -m "feat: add listSummaries, readSummary, deleteSummary helpers"
```

---

### Task 2: Create `GET /api/summaries` route

**Files:**
- Create: `src/app/api/summaries/route.ts`

**Step 1: Create the route**

```typescript
import { NextResponse } from 'next/server';
import { listSummaries } from '@/lib/files';

export async function GET() {
  const files = await listSummaries();
  return NextResponse.json({ files: files.map((name) => ({ name })) });
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles, `/api/summaries` appears in route list

**Step 3: Commit**

```bash
git add src/app/api/summaries/route.ts
git commit -m "feat: add GET /api/summaries route to list saved summaries"
```

---

### Task 3: Create `GET` and `DELETE /api/summaries/[filename]` route

**Files:**
- Create: `src/app/api/summaries/[filename]/route.ts`

**Step 1: Create the route**

```typescript
import { NextResponse } from 'next/server';
import { readSummary, deleteSummary } from '@/lib/files';
import { commitWorkLog } from '@/lib/git';

function isValidFilename(filename: string): boolean {
  return filename.endsWith('.md') && !filename.includes('/') && !filename.includes('\\') && !filename.includes('..');
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!isValidFilename(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const content = await readSummary(filename);
  if (content === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ content });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!isValidFilename(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const deleted = await deleteSummary(filename);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found or could not delete' }, { status: 404 });
  }

  const commitRes = commitWorkLog(`docs(summary): remove ${filename}`);
  return NextResponse.json({ success: true, committed: commitRes.committed });
}
```

Note: Next.js 16 uses `params: Promise<...>` — must await it.

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles, `/api/summaries/[filename]` appears in route list

**Step 3: Commit**

```bash
git add src/app/api/summaries/\[filename\]/route.ts
git commit -m "feat: add GET and DELETE /api/summaries/[filename] routes"
```

---

### Task 4: Port MarkdownViewer component and styles from ai-modal branch

**Files:**
- Create: `src/components/MarkdownViewer.tsx`
- Modify: `src/app/globals.css`

**Step 1: Create MarkdownViewer**

```typescript
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';
import { useEffect } from 'react';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export default function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Markdown.configure({
        tightLists: true,
        linkify: true,
        transformCopiedText: true,
      }),
    ],
    content,
  });

  useEffect(() => {
    if (!editor || !content) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentMd = (editor.storage as any).markdown.getMarkdown();
    if (content !== currentMd) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <EditorContent
      editor={editor}
      className={`markdown-viewer ${className ?? ''}`}
    />
  );
}
```

**Step 2: Add `.markdown-viewer` styles to `globals.css`**

Append the following at the end of `src/app/globals.css`:

```css
/* MarkdownViewer — read-only Tiptap for AI results */
.markdown-viewer .tiptap {
  outline: none;
  font-size: 0.875rem;
  line-height: 1.625;
  color: var(--foreground);
}

.markdown-viewer .tiptap > * + * {
  margin-top: 0.25em;
}

.markdown-viewer .tiptap h1 {
  font-size: 1.125rem;
  font-weight: 700;
  margin-top: 0.75rem;
  margin-bottom: 0.375rem;
  color: var(--primary);
}

.markdown-viewer .tiptap h2 {
  font-size: 1rem;
  font-weight: 700;
  margin-top: 0.625rem;
  margin-bottom: 0.375rem;
  color: color-mix(in srgb, var(--primary) 90%, transparent);
}

.markdown-viewer .tiptap h3 {
  font-size: 0.9375rem;
  font-weight: 700;
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
  color: color-mix(in srgb, var(--primary) 80%, transparent);
}

.markdown-viewer .tiptap p {
  margin-bottom: 0.375rem;
  line-height: 1.625;
}

.markdown-viewer .tiptap ul {
  list-style-type: disc;
  list-style-position: outside;
  padding-left: 1.25rem;
  margin-bottom: 0.375rem;
}

.markdown-viewer .tiptap ol {
  list-style-type: decimal;
  list-style-position: outside;
  padding-left: 1.25rem;
  margin-bottom: 0.375rem;
}

.markdown-viewer .tiptap li {
  padding-left: 0.125rem;
  line-height: 1.625;
}

.markdown-viewer .tiptap li p {
  margin-bottom: 0;
}

.markdown-viewer .tiptap a {
  color: var(--accent-foreground);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--accent-foreground) 30%, transparent);
  cursor: pointer;
  transition: text-decoration-color 0.15s;
}

.markdown-viewer .tiptap a:hover {
  text-decoration-color: var(--accent-foreground);
}

.markdown-viewer .tiptap blockquote {
  border-left: 4px solid var(--muted);
  padding-left: 1rem;
  font-style: italic;
  color: var(--muted-foreground);
  margin: 0.375rem 0;
}

.markdown-viewer .tiptap code {
  background-color: var(--muted);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-family: var(--font-mono), ui-monospace, monospace;
  color: var(--foreground);
}

.markdown-viewer .tiptap pre {
  background-color: var(--muted);
  padding: 0.5rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.375rem 0;
  font-size: 0.75rem;
  color: var(--foreground);
}

.markdown-viewer .tiptap pre code {
  background-color: transparent;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

.markdown-viewer .tiptap strong {
  font-weight: 700;
}

.markdown-viewer .tiptap em {
  font-style: italic;
}

.markdown-viewer .tiptap hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0.75rem 0;
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Compiles successfully

**Step 4: Commit**

```bash
git add src/components/MarkdownViewer.tsx src/app/globals.css
git commit -m "feat: add MarkdownViewer component with prose styles"
```

---

### Task 5: Create `SummariesModal` component

**Files:**
- Create: `src/components/SummariesModal.tsx`

**Step 1: Create the component**

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import MarkdownViewer from './MarkdownViewer';

interface SummaryFile {
  name: string;
}

interface SummariesModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDemo?: boolean;
}

function formatLabel(filename: string): string {
  // "2026-03-09-weekly-report.md" → "Mar 9, 2026 — Weekly Report"
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
  if (!match) return filename.replace('.md', '');
  const [, dateStr, slug] = match;
  const date = new Date(dateStr + 'T12:00:00');
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const label = slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `${formatted} — ${label}`;
}

const DEMO_FILES: SummaryFile[] = [
  { name: '2026-03-09-weekly-report.md' },
  { name: '2026-03-07-daily-standup.md' },
  { name: '2026-03-01-detailed-changelog.md' },
];

const DEMO_CONTENT: Record<string, string> = {
  '2026-03-09-weekly-report.md': '## Weekly Report — Mar 3–9, 2026\n\n### Key Achievements\n- Shipped the AI modal combining search and summarize\n- Merged dynamic model loading from Copilot SDK\n- Fixed 3 CI pipeline issues\n\n### In Progress\n- Summaries browser modal\n- Performance optimization for large log files\n\n### Blockers\n- None',
  '2026-03-07-daily-standup.md': '## Standup — Mar 7, 2026\n\n**Done:** Reviewed PRs, fixed linkify edge case with query params\n\n**Today:** Wire streaming search into AI modal\n\n**Blockers:** None',
  '2026-03-01-detailed-changelog.md': '## Changelog — Week of Feb 24\n\n- `feat`: Added natural language search API with 3 strategies\n- `feat`: NDJSON streaming for search progress\n- `fix`: GitHub URL regex now strips fragments and query params\n- `chore`: Upgraded Tiptap to v3.20\n- `docs`: Updated README with search documentation',
};

export default function SummariesModal({ isOpen, onClose, isDemo = false }: SummariesModalProps) {
  const [files, setFiles] = useState<SummaryFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchFiles = useCallback(async () => {
    if (isDemo) {
      setFiles(DEMO_FILES);
      return;
    }
    try {
      const res = await fetch('/api/summaries');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setFiles(data.files);
    } catch {
      setError('Failed to load summaries.');
    }
  }, [isDemo]);

  useEffect(() => {
    if (isOpen) {
      fetchFiles();
      setSelectedFile(null);
      setContent(null);
      setError(null);
    }
  }, [isOpen, fetchFiles]);

  useEffect(() => {
    if (!selectedFile) { setContent(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    if (isDemo) {
      setContent(DEMO_CONTENT[selectedFile] ?? 'No content.');
      setLoading(false);
      return;
    }

    fetch(`/api/summaries/${encodeURIComponent(selectedFile)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => { if (!cancelled) setContent(data.content); })
      .catch(() => { if (!cancelled) setError('Failed to load summary.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [selectedFile, isDemo]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleDelete = async () => {
    if (!selectedFile || isDemo) return;
    if (!confirm(`Delete "${selectedFile}"? This will be committed to git.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/summaries/${encodeURIComponent(selectedFile)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setFiles((prev) => prev.filter((f) => f.name !== selectedFile));
      setSelectedFile(null);
      setContent(null);
    } catch {
      setError('Failed to delete summary.');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="summaries-modal-title"
        className="w-full max-w-4xl rounded-2xl bg-popover shadow-xl ring-1 ring-border max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-popover sticky top-0 z-10">
          <h2 id="summaries-modal-title" className="text-lg font-semibold text-popover-foreground">Saved Summaries</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
          {/* File list */}
          <div className="sm:w-64 sm:min-w-[16rem] border-b sm:border-b-0 sm:border-r border-border overflow-y-auto shrink-0">
            {files.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No summaries yet. Generate one from the AI Assistant.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {files.map((f) => (
                  <li key={f.name}>
                    <button
                      onClick={() => setSelectedFile(f.name)}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                        selectedFile === f.name
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {formatLabel(f.name)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Content preview */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {!selectedFile && (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Select a summary to view
              </div>
            )}
            {selectedFile && loading && (
              <div className="flex items-center gap-3 p-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            )}
            {selectedFile && content && !loading && (
              <MarkdownViewer content={content} />
            )}
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {selectedFile && content && (
          <div className="border-t border-border px-6 py-4 flex justify-between items-center bg-popover sticky bottom-0 z-10">
            <div className="flex gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(content)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:shadow-sm border border-transparent hover:border-border transition-all"
              >
                Copy
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || isDemo}
                className="rounded-xl px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 hover:shadow-sm border border-transparent hover:border-destructive/20 transition-all disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : <><Trash2 className="h-3.5 w-3.5 inline-block mr-1.5" aria-hidden="true" />Delete</>}
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground">{selectedFile}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully

**Step 3: Commit**

```bash
git add src/components/SummariesModal.tsx
git commit -m "feat: add SummariesModal component with list + preview layout"
```

---

### Task 6: Wire SummariesModal into Dashboard

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Step 1: Add import and state**

Add to the import block (alongside existing `SummaryModal`, `SearchModal`):
```typescript
import SummariesModal from './SummariesModal';
```

Add `FileText` to the lucide-react import.

Add state alongside `showSummary` and `showSearch`:
```typescript
const [showSummaries, setShowSummaries] = useState(false);
```

**Step 2: Add toolbar button**

Insert a new button right after the Search button (line ~260) and before the Settings button:
```typescript
<button
  onClick={() => setShowSummaries(true)}
  className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
  aria-label="Saved Summaries"
  title="View Saved Summaries"
>
  <FileText className="h-4 w-4" aria-hidden="true" />
</button>
```

**Step 3: Render the modal**

After the `SearchModal` render (around line ~330):
```typescript
<SummariesModal
  isOpen={showSummaries}
  onClose={() => setShowSummaries(false)}
  isDemo={isDemo}
/>
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Compiles successfully

**Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: wire SummariesModal into Dashboard with toolbar button"
```

---

### Task 7: Update README

**Files:**
- Modify: `README.md`

**Step 1: Add feature bullet**

In the Features section, after the AI Assistant bullet, add:
```markdown
- **📋 Saved Summaries** — Browse, preview, copy, and delete past AI-generated summaries. Opens from the toolbar 📋 button. Summaries render as rich text with markdown-on-copy.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Saved Summaries feature to README"
```
