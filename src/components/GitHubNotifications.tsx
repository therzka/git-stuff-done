'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle } from 'lucide-react';
import { DEMO_NOTIFICATIONS } from '@/lib/demo';
import { useVisibilityPolling } from '@/hooks/useVisibilityPolling';

type Notification = {
  id: string;
  reason: string;
  title: string;
  url: string;
  repoFullName: string;
  type: string;
  updatedAt: string;
  unread: boolean;
};

function timeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000,
  );
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const reasonColors: Record<string, string> = {
  review_requested: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/20',
  comment: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20',
  mention: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20',
  assign: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20',
  subscribed: 'bg-zinc-50 text-zinc-600 ring-1 ring-inset ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-400 dark:ring-zinc-500/20',
  author: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20',
  ci_activity: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20',
};

function reasonBadge(reason: string) {
  const colors = reasonColors[reason] ?? 'bg-muted text-muted-foreground';
  const label = reason.replace(/_/g, ' ');
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}
    >
      {label}
    </span>
  );
}

function notificationUrl(n: Notification): string {
  // Return dummy URL for demo items that don't match the regex
  if (n.url.includes('api.github.com/repos/acme-corp')) {
    return 'https://github.com/acme-corp/frontend/pull/101';
  }

  // The API URL looks like https://api.github.com/repos/owner/repo/pulls/123
  // Convert to the web URL
  const match = n.url.match(
    /repos\/([^/]+\/[^/]+)\/(pulls|issues|commits)\/(.+)/,
  );
  if (match) {
    const typeMap: Record<string, string> = {
      pulls: 'pull',
      issues: 'issues',
      commits: 'commit',
    };
    return `https://github.com/${match[1]}/${typeMap[match[2]] ?? match[2]}/${match[3]}`;
  }
  return `https://github.com/${n.repoFullName}`;
}

// Module-level cache to survive remounts (e.g. layout switches)
let _notifCache: Notification[] | null = null;

export default function GitHubNotifications({ isDemo = false, onInsert, refreshTrigger }: { isDemo?: boolean; onInsert?: (text: string) => void; refreshTrigger?: number }) {
  const [notifications, setNotifications] = useState<Notification[]>(_notifCache ?? []);
  const [loading, setLoading] = useState(_notifCache === null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const visibleNotifications = notifications.filter((n) => !hiddenIds.has(n.id));
  const hiddenCount = notifications.length - visibleNotifications.length;

  const refresh = useCallback(async () => {
    try {
      if (isDemo) {
        setNotifications(DEMO_NOTIFICATIONS);
        setLoading(false);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch('/api/notifications', { signal: controller.signal });
      const data: Notification[] = await res.json();
      setNotifications(data);
      _notifCache = data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  // Initial fetch + visibility-aware polling
  useEffect(() => { refresh(); }, [refresh]);
  useVisibilityPolling(refresh, 60_000);

  // Refetch when refreshTrigger changes (e.g. ignored repos updated)
  useEffect(() => {
    if (refreshTrigger !== undefined) refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Abort on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  return (
    <div className="flex h-full flex-col rounded-xl text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-primary flex items-center gap-2">
          <Bell className="h-4 w-4" aria-hidden="true" />
          Notifications
        </h2>
        <button
          onClick={refresh}
          disabled={isDemo}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          aria-label="Refresh notifications"
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
      {hiddenCount > 0 && (
        <div className="border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
          {hiddenCount} hidden —{' '}
          <button
            onClick={() => setHiddenIds(new Set())}
            className="text-amber-500 hover:text-amber-400 transition-colors"
          >
            Show all
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4" aria-hidden="true" /> No notifications
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibleNotifications.map((n) => (
              <li
                key={n.id}
                className="group px-4 py-3 transition-colors hover:bg-muted/50"              >
                <div className="flex items-start gap-2">
                  {onInsert && (
                    <button
                      onClick={() => onInsert(`[${n.title}](${notificationUrl(n)})`)}
                      title="Insert link at cursor"
                      aria-label={`Insert link for: ${n.title}`}
                      className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v5a1.5 1.5 0 0 1-1.5 1.5H9.56l.97.97a.75.75 0 1 1-1.06 1.06l-2.25-2.25a.75.75 0 0 1 0-1.06l2.25-2.25a.75.75 0 0 1 1.06 1.06l-.97.97h2.94a.25.25 0 0 0 .25-.25v-5a.25.25 0 0 0-.25-.25h-9a.25.25 0 0 0-.25.25v2a.75.75 0 0 1-1.5 0v-2z"/>
                      </svg>
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={notificationUrl(n)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 text-sm font-medium text-foreground hover:text-primary transition-colors block truncate"
                      >
                        {n.unread && (
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-pink-400" />
                        )}
                        {n.title}
                      </a>
                      <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(n.updatedAt)}
                      </span>
                      <button
                        onClick={() => setHiddenIds((prev) => new Set(prev).add(n.id))}
                        title="Dismiss notification"
                        className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                        aria-label="Dismiss notification"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {n.repoFullName}
                      </span>
                      {reasonBadge(n.reason)}
                    </div>
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
