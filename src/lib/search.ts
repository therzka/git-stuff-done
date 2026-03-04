import { readLog, readRichLog } from './files';
import { extractGitHubUrls, fetchLinkInfo, getOctokit, parseGitHubUrl } from './github';
import { GITHUB_ORG } from './constants';

/**
 * Load work logs for a date range, returning an array of `## YYYY-MM-DD\n\ncontent` strings.
 * Tries rich log first, falls back to raw log.
 */
export async function loadLogsForRange(
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const logs: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    let content = await readRichLog(dateStr);
    if (!content) {
      content = await readLog(dateStr);
    }
    if (content && content.trim()) {
      logs.push(`## ${dateStr}\n\n${content.trim()}`);
    }
  }
  return logs;
}

export type GitHubContextItem = {
  url: string;
  type: 'issue' | 'pull';
  title: string;
  state: string;
  body: string;
  recentComments: string[];
};

/**
 * Fetch detailed context (body + recent comments) for GitHub PR/issue URLs
 * found in work logs. Used to enrich AI search context.
 */
export async function fetchGitHubContext(
  urls: string[],
): Promise<GitHubContextItem[]> {
  const octokit = await getOctokit();
  const results: GitHubContextItem[] = [];

  const fetches = urls.slice(0, 20).map(async (url) => {
    const parsed = parseGitHubUrl(url);
    if (!parsed) return null;
    const { owner, repo, number, type } = parsed;

    try {
      if (type === 'pull') {
        const [{ data: pr }, { data: comments }] = await Promise.all([
          octokit.pulls.get({ owner, repo, pull_number: number }),
          octokit.pulls.listReviewComments({
            owner,
            repo,
            pull_number: number,
            per_page: 5,
            sort: 'created',
            direction: 'desc',
          }),
        ]);
        return {
          url,
          type: 'pull' as const,
          title: pr.title,
          state: pr.state,
          body: (pr.body ?? '').slice(0, 2000),
          recentComments: comments.map(
            (c) => `${c.user?.login ?? 'unknown'}: ${c.body.slice(0, 500)}`,
          ),
        };
      }

      const [{ data: issue }, { data: comments }] = await Promise.all([
        octokit.issues.get({ owner, repo, issue_number: number }),
        octokit.issues.listComments({
          owner,
          repo,
          issue_number: number,
          per_page: 5,
          sort: 'created',
          direction: 'desc',
        }),
      ]);
      return {
        url,
        type: 'issue' as const,
        title: issue.title,
        state: issue.state,
        body: (issue.body ?? '').slice(0, 2000),
        recentComments: comments.map(
          (c) => `${c.user?.login ?? 'unknown'}: ${(c.body ?? '').slice(0, 500)}`,
        ),
      };
    } catch {
      return null;
    }
  });

  const settled = await Promise.all(fetches);
  for (const item of settled) {
    if (item) results.push(item);
  }
  return results;
}
