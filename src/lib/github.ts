import { GITHUB_ORG } from "./constants";
import { Octokit } from "@octokit/rest";
import { execFileSync } from "child_process";
import { readConfig } from "./files";

// --- Token retrieval (cached per process) ---

let cachedToken: string | null = null;

export async function getGitHubToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  // Prefer explicit read-only token, then GH_TOKEN, then gh CLI
  const envToken = process.env.GITHUB_READ_TOKEN || process.env.GH_TOKEN;
  if (envToken) {
    cachedToken = envToken.trim();
    return cachedToken;
  }
  try {
    cachedToken = execFileSync("gh", ["auth", "token"], {
      encoding: "utf-8",
    }).trim();
  } catch {
    throw new Error(
      "Failed to retrieve GitHub token. Set GITHUB_READ_TOKEN env var or ensure `gh` CLI is installed and authenticated.",
    );
  }
  if (!cachedToken) {
    throw new Error("GitHub token is empty.");
  }
  return cachedToken;
}

// --- Octokit client ---

let cachedOctokit: Octokit | null = null;

export async function getOctokit(): Promise<Octokit> {
  if (cachedOctokit) return cachedOctokit;
  const token = await getGitHubToken();
  cachedOctokit = new Octokit({ auth: token });
  return cachedOctokit;
}

// --- Issue / PR detail fetching ---

export type GitHubLinkInfo = {
  url: string;
  owner: string;
  repo: string;
  number: number;
  type: "issue" | "pull";
  title: string;
  state: string;
  labels: string[];
};

const GITHUB_URL_RE =
  /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/;

const GITHUB_URL_RE_GLOBAL =
  /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/g;

export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  number: number;
  type: "issue" | "pull";
} | null {
  const match = url.match(GITHUB_URL_RE);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    type: match[3] === "pull" ? "pull" : "issue",
    number: parseInt(match[4], 10),
  };
}

export async function fetchLinkInfo(
  url: string,
): Promise<GitHubLinkInfo | null> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) return null;

  const octokit = await getOctokit();
  const { owner, repo, number, type } = parsed;

  try {
    if (type === "pull") {
      const { data } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: number,
      });
      return {
        url,
        owner,
        repo,
        number,
        type,
        title: data.title,
        state: data.state,
        labels: data.labels.map((l) =>
          typeof l === "string" ? l : (l.name ?? ""),
        ),
      };
    }

    const { data } = await octokit.issues.get({
      owner,
      repo,
      issue_number: number,
    });
    return {
      url,
      owner,
      repo,
      number,
      type,
      title: data.title,
      state: data.state,
      labels: data.labels.map((l) =>
        typeof l === "string" ? l : (l.name ?? ""),
      ),
    };
  } catch {
    return null;
  }
}

export async function extractGitHubUrls(markdown: string): Promise<string[]> {
  const matches = markdown.match(GITHUB_URL_RE_GLOBAL);
  if (!matches) return [];
  const config = await readConfig();
  return Array.from(new Set(matches)).filter((url) => {
    const parsed = parseGitHubUrl(url);
    return (
      parsed &&
      parsed.owner === GITHUB_ORG &&
      !config.ignoredRepos.includes(parsed.repo)
    );
  });
}

// --- My PRs ---

export type MyPullRequest = {
  id: number;
  number: number;
  title: string;
  url: string;
  repoFullName: string;
  state: string;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  reviewDecision: string | null;
  ciStatus: "success" | "failure" | "pending" | null;
  unresolvedThreads: number;
  mergeQueueState: "queued" | "merging" | null;
  authorLogin: string;
  isAssignee: boolean;
};

export async function fetchMyPRs(): Promise<MyPullRequest[]> {
  const octokit = await getOctokit();
  const config = await readConfig();
  const { data: userData } = await octokit.users.getAuthenticated();
  const user = userData.login;

  // Fetch PRs authored by and assigned to the user (two queries, deduplicated)
  const [authoredRes, assignedRes] = await Promise.all([
    octokit.search.issuesAndPullRequests({
      q: `is:pr is:open author:${user} org:${GITHUB_ORG}`,
      sort: "updated",
      order: "desc",
      per_page: 30,
    }),
    octokit.search.issuesAndPullRequests({
      q: `is:pr is:open assignee:${user} org:${GITHUB_ORG}`,
      sort: "updated",
      order: "desc",
      per_page: 30,
    }),
  ]);

  // Deduplicate by ID and sort by updatedAt
  const seenIds = new Set<number>();
  const allItems = [...authoredRes.data.items, ...assignedRes.data.items]
    .filter((item) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .slice(0, 30);

  const prs = await Promise.all(
    allItems
      .filter((item) => {
        const repo = item.repository_url.split("/").pop() ?? "";
        return !config.ignoredRepos.includes(repo);
      })
      .map(async (item) => {
        const urlParts = item.repository_url.split("/");
        const owner = urlParts[urlParts.length - 2];
        const repo = urlParts[urlParts.length - 1];
        let additions = 0,
          deletions = 0,
          draft = false;
        try {
          const { data: pr } = await octokit.pulls.get({
            owner,
            repo,
            pull_number: item.number,
          });
          additions = pr.additions;
          deletions = pr.deletions;
          draft = pr.draft ?? false;
        } catch {
          /* ignore */
        }
        return {
          id: item.id,
          number: item.number,
          title: item.title,
          url: item.html_url,
          repoFullName: `${owner}/${repo}`,
          state: item.state,
          draft,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          additions,
          deletions,
          reviewDecision: null as string | null,
          ciStatus: null as MyPullRequest["ciStatus"],
          unresolvedThreads: 0,
          mergeQueueState: null as MyPullRequest["mergeQueueState"],
          authorLogin: item.user?.login ?? "",
          isAssignee: item.assignees?.some((a) => a.login === user) ?? false,
        };
      }),
  );

  // Batch-fetch merge queue status via GraphQL
  try {
    const grouped = new Map<
      string,
      { owner: string; repo: string; numbers: number[] }
    >();
    for (const pr of prs) {
      const key = pr.repoFullName;
      if (!grouped.has(key)) {
        const [owner, repo] = key.split("/");
        grouped.set(key, { owner, repo, numbers: [] });
      }
      grouped.get(key)!.numbers.push(pr.number);
    }

    // Build a single GraphQL query with aliased fields
    const fragments: string[] = [];
    const prKeyMap: string[] = []; // maps alias → "owner/repo#number"
    let idx = 0;
    for (const [, { owner, repo, numbers }] of grouped) {
      for (const num of numbers) {
        const alias = `pr${idx}`;
        fragments.push(
          `${alias}: repository(owner: "${owner}", name: "${repo}") { pullRequest(number: ${num}) { number mergeQueueEntry { position state } reviewDecision commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes { __typename ... on CheckRun { conclusion isRequired(pullRequestNumber: ${num}) } ... on StatusContext { state isRequired(pullRequestNumber: ${num}) } } } } } } } reviewThreads(first: 100) { nodes { isResolved isOutdated comments(first: 100) { nodes { author { login } } } } } } }`,
        );
        prKeyMap.push(`${owner}/${repo}#${num}`);
        idx++;
      }
    }

    if (fragments.length > 0) {
      const query = `query { ${fragments.join("\n")} }`;
      type CheckContext = {
        __typename: "CheckRun" | "StatusContext";
        conclusion?: string | null;
        state?: string;
        isRequired: boolean;
      };
      type ReviewThread = {
        isResolved: boolean;
        isOutdated: boolean;
        comments: { nodes: { author: { login: string } | null }[] };
      };
      type GraphQLPR = {
        pullRequest: {
          number: number;
          mergeQueueEntry: { position: number; state: string } | null;
          reviewDecision: string | null;
          commits: {
            nodes: {
              commit: {
                statusCheckRollup: {
                  contexts: { nodes: CheckContext[] };
                } | null;
              };
            }[];
          };
          reviewThreads: { nodes: ReviewThread[] };
        };
      };
      const result = await octokit.graphql<Record<string, GraphQLPR>>(query);

      // Build lookup map from GraphQL results
      const graphqlData = new Map<string, GraphQLPR["pullRequest"]>();
      for (let i = 0; i < prKeyMap.length; i++) {
        const data = result[`pr${i}`];
        if (data?.pullRequest) {
          graphqlData.set(prKeyMap[i], data.pullRequest);
        }
      }

      for (const pr of prs) {
        const gql = graphqlData.get(`${pr.repoFullName}#${pr.number}`);
        if (!gql) continue;

        if (gql.mergeQueueEntry) {
          const mqState = gql.mergeQueueEntry.state;
          pr.mergeQueueState =
            mqState === "LOCKED" || mqState === "MERGEABLE"
              ? "merging"
              : "queued";
        }
        pr.reviewDecision = gql.reviewDecision ?? null;

        // CI status — only consider required checks; fall back to all checks if none are required
        const contexts =
          gql.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ??
          [];
        if (contexts.length > 0) {
          const requiredChecks = contexts.filter((c) => c.isRequired);
          const checksToEvaluate =
            requiredChecks.length > 0 ? requiredChecks : contexts;

          const hasFailing = checksToEvaluate.some((c) => {
            if (c.__typename === "CheckRun") {
              return (
                c.conclusion === "FAILURE" ||
                c.conclusion === "TIMED_OUT" ||
                c.conclusion === "STARTUP_FAILURE"
              );
            }
            return c.state === "FAILURE" || c.state === "ERROR";
          });
          const hasPending = checksToEvaluate.some((c) => {
            if (c.__typename === "CheckRun") return c.conclusion === null;
            return c.state === "PENDING" || c.state === "EXPECTED";
          });

          if (hasFailing) pr.ciStatus = "failure";
          else if (hasPending) pr.ciStatus = "pending";
          else pr.ciStatus = "success";
        }

        // Count review threads with unanswered comments from human reviewers.
        // A thread counts only if a human reviewer (not the PR author, not a bot)
        // has commented AND the PR author hasn't replied after them.
        const isBot = (login: string) =>
          !login ||
          login.endsWith("[bot]") ||
          login === "copilot" ||
          login === "github-copilot";

        pr.unresolvedThreads = (gql.reviewThreads?.nodes ?? []).filter((t) => {
          if (t.isResolved) return false;
          if (t.isOutdated) return false;
          const comments = t.comments?.nodes ?? [];
          if (comments.length === 0) return false;

          // Check if any human reviewer (not the author, not a bot) participated
          const hasReviewerComment = comments.some((c) => {
            const login = c.author?.login ?? "";
            return !isBot(login) && login !== user;
          });
          if (!hasReviewerComment) return false;

          // Find the last non-bot comment — if it's from the author, they already replied
          const lastHumanComment = [...comments]
            .reverse()
            .find((c) => !isBot(c.author?.login ?? ""));
          if (!lastHumanComment) return false;
          return lastHumanComment.author?.login !== user;
        }).length;
      }
    }
  } catch {
    /* degrade gracefully */
  }

  return prs;
}

// --- Notifications ---

export type GitHubNotification = {
  id: string;
  reason: string;
  title: string;
  url: string;
  repoFullName: string;
  type: string;
  updatedAt: string;
  unread: boolean;
};

const RELEVANT_REASONS = new Set([
  "review_requested",
  "mention",
  "assign",
  "author",
  "comment",
]);

export async function fetchNotifications(options?: {
  participating?: boolean;
}): Promise<GitHubNotification[]> {
  const octokit = await getOctokit();
  const participating = options?.participating ?? true;
  const config = await readConfig();

  const { data } = await octokit.activity.listNotificationsForAuthenticatedUser(
    {
      participating,
    },
  );

  const filtered = data
    .filter((n) => n.repository.owner.login === GITHUB_ORG)
    .filter((n) => !config.ignoredRepos.includes(n.repository.name))
    .filter(
      (n) => n.subject.type === "Issue" || n.subject.type === "PullRequest",
    )
    .filter((n) => RELEVANT_REASONS.has(n.reason));

  // Fetch subject state to filter to open items only
  const withState = await Promise.all(
    filtered.map(async (n) => {
      if (!n.subject.url) return null;
      try {
        const { data: subject } = await octokit.request("GET {url}", {
          url: n.subject.url,
        });
        const state = (subject as { state?: string }).state;
        if (state && state !== "open") return null;
      } catch {
        // If we can't fetch state, include it anyway
      }
      return {
        id: n.id,
        reason: n.reason,
        title: n.subject.title,
        url: n.subject.url ?? "",
        repoFullName: n.repository.full_name,
        type: n.subject.type,
        updatedAt: n.updated_at,
        unread: n.unread,
      };
    }),
  );

  return withState.filter((n): n is GitHubNotification => n !== null);
}
