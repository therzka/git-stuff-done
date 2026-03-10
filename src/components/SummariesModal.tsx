"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Trash2, AlertTriangle, Copy, Check } from "lucide-react";
import MarkdownViewer from "./MarkdownViewer";

interface SummariesModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDemo?: boolean;
}

interface SummaryFile {
  name: string;
  label: string;
}

const DEMO_FILES: SummaryFile[] = [
  { name: "2026-03-09-weekly-report.md", label: "Mar 9, 2026 — Weekly Report" },
  { name: "2026-03-07-daily-standup.md", label: "Mar 7, 2026 — Daily Standup" },
  { name: "2026-03-03-detailed-changelog.md", label: "Mar 3, 2026 — Detailed Changelog" },
];

const DEMO_CONTENT: Record<string, string> = {
  "2026-03-09-weekly-report.md": `## Weekly Report — Mar 3–9, 2026

### Key Achievements
- Shipped new dashboard layout with responsive grid
- Merged 8 PRs across 3 repositories
- Resolved 4 critical bugs in the notification pipeline

### In Progress
- Migrating auth service to new token format
- Performance tuning for the search indexer

### Next Steps
- Deploy auth changes to staging
- Begin Q2 planning document`,

  "2026-03-07-daily-standup.md": `## Daily Standup — Mar 7, 2026

**Yesterday:** Finished PR review backlog, merged notification pipeline fix.

**Today:** Working on auth token migration, pair-programming session at 2pm.

**Blockers:** Waiting on design approval for settings page redesign.`,

  "2026-03-03-detailed-changelog.md": `## Changelog — Mar 3, 2026

### Bug Fixes
- Fixed race condition in notification polling (#142)
- Corrected timezone handling in date picker (#138)

### Features
- Added keyboard shortcuts for panel navigation
- Implemented dark mode toggle persistence

### Refactors
- Extracted shared polling hook into \`useVisibilityPolling\`
- Simplified API error handling with unified wrapper`,
};

function parseFilename(filename: string): string {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
  if (!match) return filename;
  const [, dateStr, slug] = match;
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const UPPERCASE_WORDS = new Set(["ai", "ci", "pr", "api", "ui", "css", "sdk"]);
  const title = slug
    .split("-")
    .map((w) => UPPERCASE_WORDS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `${formattedDate} — ${title}`;
}

export default function SummariesModal({
  isOpen,
  onClose,
  isDemo = false,
}: SummariesModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<SummaryFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchFiles = useCallback(async () => {
    if (isDemo) {
      setFiles(DEMO_FILES);
      return;
    }
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch("/api/summaries");
      if (!res.ok) throw new Error("Failed to load summaries");
      const data = await res.json();
      const parsed: SummaryFile[] = (data.files ?? []).map(
        (f: { name: string }) => ({
          name: f.name,
          label: parseFilename(f.name),
        })
      );
      setFiles(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load summaries");
    } finally {
      setLoadingList(false);
    }
  }, [isDemo]);

  // Fetch file list on open
  useEffect(() => {
    if (!isOpen) return;
    setSelectedFile(null);
    setContent(null);
    setError(null);
    setCopied(false);
    fetchFiles();
  }, [isOpen, fetchFiles]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Fetch content when a file is selected
  useEffect(() => {
    if (!selectedFile) {
      setContent(null);
      return;
    }
    setError(null);
    setCopied(false);

    if (isDemo) {
      setContent(DEMO_CONTENT[selectedFile] ?? "No content available.");
      return;
    }

    let cancelled = false;
    const fetchContent = async () => {
      setLoadingContent(true);
      try {
        const res = await fetch(
          `/api/summaries/${encodeURIComponent(selectedFile)}`
        );
        if (!res.ok) throw new Error("Failed to load summary");
        const data = await res.json();
        if (!cancelled) setContent(data.content);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Failed to load summary"
          );
      } finally {
        if (!cancelled) setLoadingContent(false);
      }
    };
    fetchContent();
    return () => {
      cancelled = true;
    };
  }, [selectedFile, isDemo]);

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!selectedFile || isDemo) return;
    const label =
      files.find((f) => f.name === selectedFile)?.label ?? selectedFile;
    if (!confirm(`Delete "${label}"?`)) return;

    try {
      const res = await fetch(
        `/api/summaries/${encodeURIComponent(selectedFile)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete summary");
      setFiles((prev) => prev.filter((f) => f.name !== selectedFile));
      setSelectedFile(null);
      setContent(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete summary");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node))
          onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-4xl rounded-2xl bg-popover shadow-xl ring-1 ring-border max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-popover sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-popover-foreground">
            Saved Summaries
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body: two-panel layout */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden min-h-0">
          {/* File list (left panel) */}
          <div className="sm:w-64 shrink-0 border-b sm:border-b-0 sm:border-r border-border overflow-y-auto">
            {loadingList ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
            ) : files.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                No summaries yet. Generate one from the AI Assistant.
              </p>
            ) : (
              <ul className="py-1">
                {files.map((file) => (
                  <li key={file.name}>
                    <button
                      onClick={() => setSelectedFile(file.name)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        selectedFile === file.name
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      {file.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Content preview (right panel) */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {loadingContent ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
            ) : content ? (
              <MarkdownViewer content={content} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">
                Select a summary to view
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        {selectedFile && content && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3 bg-popover sticky bottom-0 z-10">
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={handleDelete}
                disabled={isDemo}
                className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
            <span className="text-xs text-muted-foreground truncate ml-4">
              {selectedFile}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
