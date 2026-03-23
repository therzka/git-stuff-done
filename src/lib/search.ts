import { readLog, readRichLog } from './files';
import { extractGitHubUrls, fetchLinkInfo, getOctokit, parseGitHubUrl } from './github';
import { callCopilot } from './copilot';

export type SearchMode = 'exhaustive' | 'date_bounded' | 'recent_first';

export type QueryClassification = {
  mode: SearchMode;
  startDate?: string;
  endDate?: string;
};

/**
 * Classify a search query to determine the optimal search strategy.
 * Uses a lightweight AI call to detect whether the query asks for
 * exhaustive results, a specific date range, or recent-first lookup.
 */
export async function classifySearchQuery(
  query: string,
  todayDate: string,
  model: string = 'gpt-4.1',
): Promise<QueryClassification> {
  const prompt = `You are a query classifier. Given a user question about their work logs, classify the search intent.

Today's date is ${todayDate}.

Respond with ONLY a JSON object (no markdown, no code fences) in this exact format:
{"mode": "<mode>", "startDate": "<YYYY-MM-DD or null>", "endDate": "<YYYY-MM-DD or null>"}

Modes:
- "exhaustive": The user wants ALL instances/examples across their ENTIRE history with NO time constraint. Keywords: "all", "every time", "each time", "how many times", "list all", "find all", "all examples", "all instances", "whenever". Only use this when there is NO time range specified.
- "date_bounded": The user specifies or implies a time range. This ALSO applies when the user wants comprehensive/exhaustive results WITHIN a time period (e.g. "how many times since January", "every standup this year"). Resolve relative dates to absolute dates using today's date. Examples: "last week", "last two weeks", "in February", "since January", "this month", "yesterday", "this year", "since the beginning of the year".
- "recent_first": The user wants the most recent match or general info without a specific range. This is the DEFAULT only when neither exhaustive nor date_bounded applies. Examples: "when did I last...", "what am I working on", "what happened with X", "where did I mention X", "did I ever work on X".

IMPORTANT: When a query combines exhaustive intent ("how many times", "every", "list all") WITH a time range ("since January", "this year", "last month"), ALWAYS use "date_bounded" with the correct dates — NOT "exhaustive" or "recent_first".

IMPORTANT: "where did I mention X" or "did I mention X" asks for a SINGLE occurrence (recent_first), NOT all occurrences. Only use "exhaustive" when the user explicitly asks for ALL/EVERY instance.

Examples:
Q: "find all examples of pairing sessions" → {"mode": "exhaustive", "startDate": null, "endDate": null}
Q: "what did I work on last week" → {"mode": "date_bounded", "startDate": "...", "endDate": "..."}
Q: "every time I mentioned the auth migration" → {"mode": "exhaustive", "startDate": null, "endDate": null}
Q: "when did I last meet with Sarah" → {"mode": "recent_first", "startDate": null, "endDate": null}
Q: "where did I mention updating the redis config" → {"mode": "recent_first", "startDate": null, "endDate": null}
Q: "did I ever mention X" → {"mode": "recent_first", "startDate": null, "endDate": null}
Q: "find when I discussed X in the last two weeks" → {"mode": "date_bounded", "startDate": "...", "endDate": "..."}
Q: "how many times have I paired with X since January" → {"mode": "date_bounded", "startDate": "${todayDate.slice(0, 4)}-01-01", "endDate": "${todayDate}"}
Q: "list every standup this year" → {"mode": "date_bounded", "startDate": "${todayDate.slice(0, 4)}-01-01", "endDate": "${todayDate}"}
Q: "all the times I mentioned Y since the beginning of the year" → {"mode": "date_bounded", "startDate": "${todayDate.slice(0, 4)}-01-01", "endDate": "${todayDate}"}

User question: "${query}"`;

  try {
    const result = await callCopilot(
      'You are a JSON classifier. Output only valid JSON, nothing else.',
      prompt,
      model,
    );

    const cleaned = result.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);

    const mode: SearchMode =
      parsed.mode === 'exhaustive' || parsed.mode === 'date_bounded'
        ? parsed.mode
        : 'recent_first';

    return {
      mode,
      startDate: parsed.startDate && parsed.startDate !== 'null' ? parsed.startDate : undefined,
      endDate: parsed.endDate && parsed.endDate !== 'null' ? parsed.endDate : undefined,
    };
  } catch {
    // If classification fails, fall back to the default recent-first strategy
    return { mode: 'recent_first' };
  }
}

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
