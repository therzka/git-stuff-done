'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, GitPullRequest } from 'lucide-react';
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
  const url = session.pullRequestUrl ?? session.taskUrl ?? '';
  return url ? `[${session.name}](${url})` : session.name;
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
      const data: AgentSession[] = res.ok ? await res.json() : [];
      setSessions(data);
      _sessionCache = data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useVisibilityPolling(refresh, 5 * 60_000);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const groups = groupByDate(sessions);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-base font-semibold text-primary flex items-center gap-2">
          <Bot className="h-4 w-4" aria-hidden="true" />
          <a
            href="https://github.com/copilot/agents"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Agent Sessions
          </a>
        </h2>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
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
            <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground bg-muted border-b border-border sticky top-0">
              {bucket}
            </div>
            <ul className="divide-y divide-border">
              {items.map((session) => {
                const repoShort = session.repository?.split('/')[1] ?? session.repository;

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
                          aria-label={`Insert link for "${session.name}"`}
                          className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
                        {session.taskUrl ? (
                          <a
                            href={session.taskUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-foreground truncate leading-snug hover:underline block"
                          >
                            {session.name}
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-foreground truncate leading-snug block">
                            {session.name}
                          </span>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          {repoShort && (
                            <span className="flex items-center gap-1">
                              <GitPullRequest className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate max-w-[160px]">{repoShort}</span>
                            </span>
                          )}
                          <span>{timeAgo(session.createdAt)}</span>
                          {session.pullRequestNumber && (
                            <a
                              href={session.pullRequestUrl ?? '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`rounded-full px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset tabular-nums ${
                                session.pullRequestState === 'MERGED'
                                  ? 'bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-500/10 dark:text-purple-400 dark:ring-purple-500/20'
                                  : session.pullRequestState === 'CLOSED'
                                  ? 'bg-zinc-50 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-400 dark:ring-zinc-500/20'
                                  : 'bg-muted text-muted-foreground ring-border'
                              }`}
                            >
                              PR #{session.pullRequestNumber}
                            </a>
                          )}
                          {session.state !== 'completed' && (
                            <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                              session.state === 'in_progress'
                                ? 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20'
                                : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20'
                            }`}>
                              {session.state === 'in_progress' ? 'running' : 'timed out'}
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
