import { CopilotClient } from '@github/copilot-sdk';
import { extractGitHubUrls, fetchLinkInfo, type GitHubLinkInfo } from './github';

const MODEL = 'gpt-4.1';

/**
 * Simple fallback: replace bare GitHub URLs with markdown links using fetched titles.
 */
function applyLinkification(
  markdown: string,
  linkMap: Map<string, GitHubLinkInfo>,
): string {
  let result = markdown;
  linkMap.forEach((info, url) => {
    const label = `${info.title} (${info.owner}/${info.repo}#${info.number})`;
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace <url> autolinks (angle-bracket wrapped)
    result = result.replace(new RegExp(`<${escaped}>`, 'g'), `[${label}](${url})`);
    // Replace bare URLs (not already inside markdown links)
    const bare = new RegExp(`(?<!\\()${escaped}(?!\\))`, 'g');
    result = result.replace(bare, `[${label}](${url})`);
  });
  return result;
}

/**
 * Call the Copilot SDK with a system prompt and user prompt, return the response.
 * Combines both prompts into a single request to avoid a wasted round-trip.
 */
export async function callCopilot(
  systemPrompt: string, 
  userPrompt: string, 
  model: string = MODEL,
  timeout?: number,
): Promise<string> {
  const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  const client = new CopilotClient();
  try {
    const session = await client.createSession({ model });
    const response = await session.sendAndWait({ prompt: combinedPrompt }, timeout);
    return response?.data?.content ?? '';
  } finally {
    await client.stop();
  }
}

/**
 * Linkify a raw markdown work log by fetching GitHub link details and
 * replacing bare URLs with titled markdown links.
 */
export async function linkifyWorkLog(rawMarkdown: string): Promise<string> {
  // Strip suffixes (sub-paths, fragments, query params) from GitHub issue/PR URLs
  // e.g. /pull/123/files, /issues/123#issuecomment-456, /pull/123?diff=unified
  const cleaned = rawMarkdown.replace(
    /(https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:issues|pull)\/\d+)[/#?][^\s)\]>]*/g,
    '$1',
  );
  const urls = await extractGitHubUrls(cleaned);
  const linkMap = new Map<string, GitHubLinkInfo>();

  const results = await Promise.all(urls.map((u) => fetchLinkInfo(u)));
  for (const info of results) {
    if (info) linkMap.set(info.url, info);
  }

  return applyLinkification(cleaned, linkMap);
}
