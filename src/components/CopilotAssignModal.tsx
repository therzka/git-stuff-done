"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, AlertTriangle, Check } from "lucide-react";
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { useModels } from "@/hooks/useModels";

type OrgRepo = {
  name: string;
  fullName: string;
};

interface CopilotAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  issueTitle: string;
  issueRepo: string;
  issueNumber: number;
  onAssigned: () => void;
}

export default function CopilotAssignModal({
  isOpen,
  onClose,
  issueTitle,
  issueRepo,
  issueNumber,
  onAssigned,
}: CopilotAssignModalProps) {
  const { models, loading: modelsLoading } = useModels(isOpen);
  const [repos, setRepos] = useState<OrgRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposLoadingMore, setReposLoadingMore] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [repoPage, setRepoPage] = useState(1);
  const [repoHasMore, setRepoHasMore] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const repoListRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repoCacheRef = useRef<Map<string, { repos: OrgRepo[]; hasMore: boolean }>>(new Map());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch repos (paginated, with optional search query)
  const fetchRepos = useCallback(
    async (page: number, query: string, append: boolean) => {
      const cacheKey = `${query}::${page}`;

      // Check cache first
      const cached = repoCacheRef.current.get(cacheKey);
      if (cached && !append) {
        setRepos(cached.repos);
        setRepoHasMore(cached.hasMore);
        setRepoPage(page);
        return;
      }

      if (append) setReposLoadingMore(true);
      else setReposLoading(true);

      try {
        const params = new URLSearchParams({ page: String(page) });
        if (query) params.set("q", query);
        const res = await fetch(`/api/repos?${params}`);
        const data = await res.json();
        if (!mountedRef.current) return;
        const incoming: OrgRepo[] = data.repos ?? [];
        const hasMore = data.hasMore ?? false;

        // Cache the result
        repoCacheRef.current.set(cacheKey, { repos: append ? [] : incoming, hasMore });

        setRepos((prev) => (append ? [...prev, ...incoming] : incoming));
        setRepoHasMore(hasMore);
        setRepoPage(page);
      } catch {
        // ignore
      } finally {
        if (mountedRef.current) {
          setReposLoading(false);
          setReposLoadingMore(false);
        }
      }
    },
    [],
  );

  // Initial fetch when modal opens
  useEffect(() => {
    if (!isOpen) return;
    fetchRepos(1, "", false);
  }, [isOpen, fetchRepos]);

  // Debounced search
  const handleRepoSearch = useCallback(
    (value: string) => {
      setRepoSearch(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        fetchRepos(1, value, false);
      }, 300);
    },
    [fetchRepos],
  );

  // Infinite scroll — fetch next page when near bottom
  const handleRepoScroll = useCallback(() => {
    const el = repoListRef.current;
    if (!el || reposLoadingMore || !repoHasMore) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (nearBottom) {
      fetchRepos(repoPage + 1, repoSearch, true);
    }
  }, [repoPage, repoSearch, repoHasMore, reposLoadingMore, fetchRepos]);

  // Select first model when loaded
  useEffect(() => {
    if (!modelsLoading && models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, modelsLoading, selectedModel]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedRepo("");
      setSelectedModel("");
      setInstructions("");
      setError(null);
      setSuccess(false);
      setRepoSearch("");
      setRepoPage(1);
      setRepoHasMore(true);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!selectedRepo) {
      setError("Please select a target repository.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const [owner, repo] = issueRepo.split("/");
      const res = await fetch("/api/copilot-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          issueNumber,
          targetRepo: selectedRepo,
          model: selectedModel,
          instructions,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to assign Copilot");
      }

      if (mountedRef.current) {
        setSuccess(true);
        setTimeout(() => {
          if (mountedRef.current) {
            onAssigned();
            onClose();
          }
        }, 1500);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [
    selectedRepo,
    selectedModel,
    instructions,
    issueRepo,
    issueNumber,
    onAssigned,
    onClose,
  ]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      style={{ zIndex: 9999 }}
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node))
          onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-2xl bg-popover shadow-xl ring-1 ring-border max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-popover">
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-5 w-5 text-primary"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M19.245 5.364c1.322 1.36 1.877 3.216 2.11 5.817.622 0 1.2.135 1.592.654l.73.964c.21.278.323.61.323.955v2.62c0 .339-.173.669-.453.868C20.239 19.602 16.157 21.5 12 21.5c-4.6 0-9.205-2.583-11.547-4.258-.28-.2-.452-.53-.453-.868v-2.62c0-.345.113-.679.321-.956l.73-.963c.392-.517.974-.654 1.593-.654l.029-.297c.25-2.446.81-4.213 2.082-5.52 2.461-2.54 5.71-2.851 7.146-2.864h.198c1.436.013 4.685.323 7.146 2.864zm-7.244 4.328c-.284 0-.613.016-.962.05-.123.447-.305.85-.57 1.108-1.05 1.023-2.316 1.18-2.994 1.18-.638 0-1.306-.13-1.851-.464-.516.165-1.012.403-1.044.996a65.882 65.882 0 00-.063 2.884l-.002.48c-.002.563-.005 1.126-.013 1.69.002.326.204.63.51.765 2.482 1.102 4.83 1.657 6.99 1.657 2.156 0 4.504-.555 6.985-1.657a.854.854 0 00.51-.766c.03-1.682.006-3.372-.076-5.053-.031-.596-.528-.83-1.046-.996-.546.333-1.212.464-1.85.464-.677 0-1.942-.157-2.993-1.18-.266-.258-.447-.661-.57-1.108-.32-.032-.64-.049-.96-.05zm-2.525 4.013c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zm5 0c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951z" />
            </svg>
            <h2 className="text-lg font-semibold text-popover-foreground">
              Assign to Copilot
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Issue context */}
          <div className="rounded-xl bg-muted/50 border border-border px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Issue
            </div>
            <div className="text-sm font-medium text-foreground truncate">
              {issueTitle}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {issueRepo}#{issueNumber}
            </div>
          </div>

          {/* Target repo */}
          <div>
            <label
              className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider"
            >
              Target Repository <span className="text-destructive">*</span>
            </label>
            <Combobox
              value={selectedRepo}
              onChange={(val) => setSelectedRepo(val ?? "")}
              immediate
            >
              <div className="relative">
                <ComboboxInput
                  className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all data-[open]:rounded-b-none data-[open]:border-b-0"
                  placeholder="Search repos…"
                  displayValue={(val: string) => val}
                  onChange={(e) => handleRepoSearch(e.target.value)}
                />
                {reposLoading && (
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    Loading…
                  </div>
                )}
                <ComboboxOptions
                  ref={repoListRef}
                  onScroll={handleRepoScroll}
                  className="absolute left-0 right-0 top-full z-10 max-h-48 overflow-y-auto rounded-b-xl border border-t-0 border-input bg-popover shadow-lg empty:hidden"
                >
                  {!reposLoading && repos.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {repoSearch ? "No repos found" : "No repos available"}
                    </div>
                  )}
                  {repos.map((r) => (
                    <ComboboxOption
                      key={r.fullName}
                      value={r.fullName}
                      className="group flex items-center gap-2 px-3 py-2 text-sm text-foreground data-[focus]:bg-primary/10 data-[focus]:text-primary data-[selected]:font-medium transition-colors"
                    >
                      <Check className="h-3.5 w-3.5 shrink-0 opacity-0 group-data-[selected]:opacity-100" aria-hidden="true" />
                      <span className="truncate">{r.fullName}</span>
                    </ComboboxOption>
                  ))}
                  {reposLoadingMore && (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                      Loading more…
                    </div>
                  )}
                </ComboboxOptions>
              </div>
            </Combobox>
          </div>

          {/* Model selector */}
          <div>
            <label
              htmlFor="copilot-model"
              className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider"
            >
              AI Model
            </label>
            <div className="relative">
              <select
                id="copilot-model"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={modelsLoading}
                className="w-full appearance-none rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {modelsLoading ? (
                  <option value="">Loading models…</option>
                ) : (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label
              htmlFor="copilot-instructions"
              className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider"
            >
              Additional Instructions{" "}
              <span className="normal-case tracking-normal font-normal">
                (optional)
              </span>
            </label>
            <textarea
              id="copilot-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full h-24 rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 resize-none transition-all"
              placeholder="E.g. Focus on the backend API, use existing patterns in src/services/..."
            />
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-xl border border-destructive/20 flex items-center gap-2">
              <AlertTriangle
                className="h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              Copilot has been assigned! It will start working shortly.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end gap-3 bg-popover">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground border border-border bg-muted/50 hover:bg-muted transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || success || !selectedRepo}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              "Assigning…"
            ) : success ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" /> Assigned
              </>
            ) : (
              "Assign to Copilot"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
