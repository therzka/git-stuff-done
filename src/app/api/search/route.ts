import { NextResponse } from 'next/server';
import { callCopilot } from '@/lib/copilot';
import { extractGitHubUrls } from '@/lib/github';
import { loadLogsForRange, fetchGitHubContext } from '@/lib/search';
import type { GitHubContextItem } from '@/lib/search';

const MAX_LOOKBACK_DAYS = 365;
const WINDOW_SIZE = 7;
const MAX_ITERATIONS_PER_REQUEST = 7; // ~49 days per request to avoid timeouts

const NEED_MORE_CONTEXT = 'NEED_MORE_CONTEXT';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function buildSystemPrompt(todayDate: string): string {
  return `You are a helpful assistant that answers questions about a developer's work logs.
Today's date is ${todayDate}. Use this to interpret relative time expressions like "last week", "a month ago", "yesterday", etc.

IMPORTANT RULES:
- Answer ONLY based on the work logs and GitHub context provided below.
- If the logs do not contain enough information to answer the question, respond with exactly: ${NEED_MORE_CONTEXT}
- NEVER fabricate, guess, or make up information. If you are not sure, say ${NEED_MORE_CONTEXT}.
- Be concise and specific. Reference dates and PR/issue numbers when relevant.
- Use Markdown formatting in your response.`;
}

function buildUserPrompt(
  query: string,
  logs: string[],
  githubContext: GitHubContextItem[],
  searchWindow: string,
): string {
  let prompt = `### Question\n${query}\n\n### Search Window\n${searchWindow}\n\n### Work Logs\n`;
  prompt += logs.join('\n\n---\n\n');

  if (githubContext.length > 0) {
    prompt += '\n\n### Referenced GitHub Items\n';
    for (const item of githubContext) {
      prompt += `\n#### ${item.type === 'pull' ? 'PR' : 'Issue'}: ${item.title} (${item.state})\nURL: ${item.url}\n`;
      if (item.body) {
        prompt += `Body:\n${item.body}\n`;
      }
      if (item.recentComments.length > 0) {
        prompt += `Recent comments:\n${item.recentComments.join('\n')}\n`;
      }
    }
  }

  return prompt;
}

export async function POST(req: Request) {
  try {
    const { query, model, todayDate, offsetDays = 0 } = await req.json();

    if (!query || !todayDate) {
      return NextResponse.json(
        { error: 'Missing query or todayDate' },
        { status: 400 },
      );
    }

    const today = new Date(todayDate + 'T12:00:00');
    const allLogs: string[] = [];
    const allUrls = new Set<string>();
    let daysSearched = offsetDays;
    let answer: string | null = null;

    for (let iter = 0; iter < MAX_ITERATIONS_PER_REQUEST; iter++) {
      const windowEnd = new Date(today);
      windowEnd.setDate(windowEnd.getDate() - daysSearched);
      const windowStart = new Date(windowEnd);
      windowStart.setDate(windowStart.getDate() - WINDOW_SIZE + 1);

      const startStr = formatDate(windowStart);
      const endStr = formatDate(windowEnd);

      const newLogs = await loadLogsForRange(startStr, endStr);
      allLogs.push(...newLogs);
      daysSearched += WINDOW_SIZE;

      // Extract and collect GitHub URLs from new logs
      for (const log of newLogs) {
        const urls = await extractGitHubUrls(log);
        urls.forEach((u) => allUrls.add(u));
      }

      // If we have no logs at all yet and haven't hit the cap, keep looking
      if (allLogs.length === 0 && daysSearched < MAX_LOOKBACK_DAYS) {
        continue;
      }

      // If still no logs and we've hit the cap, give up
      if (allLogs.length === 0) {
        return NextResponse.json({
          answer:
            "I couldn't find any work logs in the searched time period. There may not be any logs recorded for those dates.",
          daysSearched,
          exhausted: true,
        });
      }

      // Fetch GitHub context for enrichment
      const githubContext = await fetchGitHubContext(Array.from(allUrls));

      const searchWindow = `Searching from ${formatDate(
        new Date(today.getTime() - daysSearched * 86400000),
      )} to ${todayDate} (${daysSearched} days)`;

      const systemPrompt = buildSystemPrompt(todayDate);
      const userPrompt = buildUserPrompt(
        query,
        allLogs,
        githubContext,
        searchWindow,
      );

      const result = await callCopilot(systemPrompt, userPrompt, model);

      if (result.trim() === NEED_MORE_CONTEXT) {
        if (daysSearched >= MAX_LOOKBACK_DAYS) {
          return NextResponse.json({
            answer:
              "I searched through a full year of work logs but couldn't find information relevant to your question. The answer may not be in your recorded logs.",
            daysSearched,
            exhausted: true,
          });
        }
        // If we've hit the per-request iteration limit, return partial result
        // so the client can resume
        if (iter === MAX_ITERATIONS_PER_REQUEST - 1) {
          return NextResponse.json({
            answer: null,
            daysSearched,
            exhausted: false,
          });
        }
        continue;
      }

      answer = result;
      break;
    }

    return NextResponse.json({
      answer:
        answer ??
        "I couldn't find information relevant to your question in the searched logs.",
      daysSearched,
      exhausted: daysSearched >= MAX_LOOKBACK_DAYS,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 },
    );
  }
}
