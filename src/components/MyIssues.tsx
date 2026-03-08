"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDot, MessageSquare, CheckCircle, Tag } from "lucide-react";
import { DEMO_ISSUES } from "@/lib/demo";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";

type Issue = {
  id: number;
  number: number;
  title: string;
  url: string;
  repoFullName: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  commentCount: number;
  author: string;
  linkedPRs: {
    number: number;
    title: string;
    url: string;
    state: string;
    isDraft: boolean;
  }[];
};

function timeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Module-level cache to survive remounts (e.g. layout switches)
let _issueCache: Issue[] | null = null;

export default function MyIssues({
  isDemo = false,
  onInsert,
}: {
  isDemo?: boolean;
  onInsert?: (text: string) => void;
}) {
  const [issues, setIssues] = useState<Issue[]>(_issueCache ?? []);
  const [loading, setLoading] = useState(_issueCache === null);
  const [showLabels, setShowLabels] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    try {
      if (isDemo) {
        setIssues(DEMO_ISSUES);
        setLoading(false);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch("/api/issues", { signal: controller.signal });
      const data: Issue[] = await res.json();
      setIssues(data);
      _issueCache = data;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useVisibilityPolling(refresh, 120_000);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-primary flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M8 6h10"/><path d="M6 12h9"/><path d="M11 18h7"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>
            My Issues
          </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowLabels((v) => !v)}
            className={`rounded-lg p-1.5 text-xs transition-colors ${showLabels ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
            aria-label="Toggle labels"
            title={showLabels ? "Hide labels" : "Show labels"}
          >
            <Tag className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
          onClick={refresh}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Refresh Issues"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clipRule="evenodd"
            />
          </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : issues.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4" aria-hidden="true" /> No open issues
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {issues.map((issue) => (
              <li
                key={issue.id}
                className="group px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start gap-2">
                  {onInsert && (
                    <button
                      onClick={() =>
                        onInsert(
                          `[${issue.repoFullName}#${issue.number} ${issue.title}](${issue.url})`,
                        )
                      }
                      title="Insert link at cursor"
                      aria-label={`Insert link for issue #${issue.number}`}
                      className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none transition-all"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="w-4 h-4"
                        aria-hidden="true"
                      >
                        <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v5a1.5 1.5 0 0 1-1.5 1.5H9.56l.97.97a.75.75 0 1 1-1.06 1.06l-2.25-2.25a.75.75 0 0 1 0-1.06l2.25-2.25a.75.75 0 0 1 1.06 1.06l-.97.97h2.94a.25.25 0 0 0 .25-.25v-5a.25.25 0 0 0-.25-.25h-9a.25.25 0 0 0-.25.25v2a.75.75 0 0 1-1.5 0v-2z" />
                      </svg>
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 text-sm font-medium text-foreground hover:text-primary transition-colors block truncate"
                      >
                        {issue.title}
                      </a>
                      <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(issue.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {issue.repoFullName}#{issue.number}
                      </span>
                      {issue.commentCount > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" aria-hidden="true" /> {issue.commentCount}
                        </span>
                      )}
                    </div>
                    {showLabels && issue.labels.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {issue.labels.map((label) => (
                          <span
                            key={label}
                            className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                    {issue.linkedPRs.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {issue.linkedPRs.map((pr) => {
                          const isMerged = pr.state === "MERGED";
                          const isClosed = pr.state === "CLOSED";
                          const isDraft = pr.isDraft;
                          return (
                            <a
                              key={pr.number}
                              href={pr.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={pr.title}
                              className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${
                                isMerged
                                  ? "border-purple-400/40 bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700/50"
                                  : isClosed
                                    ? "border-border bg-muted text-muted-foreground"
                                    : isDraft
                                      ? "border-border bg-muted text-muted-foreground"
                                      : "border-emerald-500/40 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-700/50"
                              }`}
                            >
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z" />
                              </svg>
                              #{pr.number}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
