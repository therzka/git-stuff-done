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
