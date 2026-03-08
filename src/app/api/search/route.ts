import { NextResponse } from 'next/server';
import { callCopilot } from '@/lib/copilot';
import { extractGitHubUrls } from '@/lib/github';
import {
  loadLogsForRange,
  fetchGitHubContext,
  classifySearchQuery,
} from '@/lib/search';
import type { GitHubContextItem, SearchMode } from '@/lib/search';

const MAX_LOOKBACK_DAYS = 365;
const WINDOW_SIZE = 7;
const MAX_ITERATIONS_PER_REQUEST = 7; // ~49 days per request to avoid timeouts
const EXHAUSTIVE_CHUNK_DAYS = 60;
const MAX_SINGLE_SHOT_CHARS = 80_000;
const SEARCH_TIMEOUT_MS = 180_000; // 3 minutes for large search prompts

const NEED_MORE_CONTEXT = 'NEED_MORE_CONTEXT';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function buildSystemPrompt(todayDate: string, mode: SearchMode): string {
  const base = `You are a helpful assistant that answers questions about a developer's work logs.
Today's date is ${todayDate}. Use this to interpret relative time expressions like "last week", "a month ago", "yesterday", etc.`;

  if (mode === 'exhaustive') {
    return `${base}

IMPORTANT RULES:
- Answer ONLY based on the work logs and GitHub context provided below.
- Find and list ALL instances, occurrences, and examples relevant to the question.
- Be COMPREHENSIVE — do not stop at the first match. List every relevant entry with its date.
- If you find multiple instances, organize them chronologically.
- If the logs do not contain any relevant information, respond with exactly: ${NEED_MORE_CONTEXT}
- NEVER fabricate, guess, or make up information.
- Use Markdown formatting in your response.`;
  }

  return `${base}

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

async function collectUrlsFromLogs(logs: string[]): Promise<Set<string>> {
  const urls = new Set<string>();
  for (const log of logs) {
    const found = await extractGitHubUrls(log);
    found.forEach((u) => urls.add(u));
  }
  return urls;
}

/**
 * Load all available logs up to MAX_LOOKBACK_DAYS from today.
 */
async function loadAllLogs(
  today: Date,
): Promise<{ logs: string[]; daysSearched: number }> {
  const endDate = formatDate(today);
  const start = new Date(today);
  start.setDate(start.getDate() - MAX_LOOKBACK_DAYS);
  const startDate = formatDate(start);
  const logs = await loadLogsForRange(startDate, endDate);
  return { logs, daysSearched: MAX_LOOKBACK_DAYS };
}

/**
 * Exhaustive search: load all logs, find ALL instances.
 * If logs are too large for a single AI call, batch into chunks and merge.
 */
async function searchExhaustive(
  query: string,
  model: string,
  todayDate: string,
  today: Date,
) {
  console.log(`[search] exhaustive: loading all logs`);
  const { logs, daysSearched } = await loadAllLogs(today);

  if (logs.length === 0) {
    console.log(`[search] exhaustive: no logs found`);
    return NextResponse.json({
      answer:
        "I couldn't find any work logs in the searched time period. There may not be any logs recorded for those dates.",
      daysSearched,
      exhausted: true,
      searchMode: 'exhaustive' as SearchMode,
    });
  }

  const totalChars = logs.reduce((sum, l) => sum + l.length, 0);
  console.log(`[search] exhaustive: loaded ${logs.length} logs, ${totalChars} chars`);
  const allUrls = await collectUrlsFromLogs(logs);
  const githubContext = await fetchGitHubContext(Array.from(allUrls));
  console.log(`[search] exhaustive: ${allUrls.size} GitHub URLs, ${githubContext.length} context items`);
  const systemPrompt = buildSystemPrompt(todayDate, 'exhaustive');

  if (totalChars <= MAX_SINGLE_SHOT_CHARS) {
    console.log(`[search] exhaustive: single-shot (${totalChars} <= ${MAX_SINGLE_SHOT_CHARS})`);
    const searchWindow = `Searching ALL available logs (${daysSearched} days)`;
    const userPrompt = buildUserPrompt(query, logs, githubContext, searchWindow);
    const aiStart = Date.now();
    const result = await callCopilot(systemPrompt, userPrompt, model, SEARCH_TIMEOUT_MS);
    console.log(`[search] exhaustive: AI call took ${Date.now() - aiStart}ms, response ${result.length} chars`);

    const answer =
      result.trim() === NEED_MORE_CONTEXT
        ? "I searched through all available work logs but couldn't find information relevant to your question."
        : result;

    return NextResponse.json({
      answer,
      daysSearched,
      exhausted: true,
      searchMode: 'exhaustive' as SearchMode,
    });
  }

  // Batched: logs are too large, search in chunks and merge
  const totalBatches = Math.ceil(logs.length / EXHAUSTIVE_CHUNK_DAYS);
  console.log(`[search] exhaustive: batched mode — ${totalBatches} batches (${totalChars} chars > ${MAX_SINGLE_SHOT_CHARS})`);
  const partialFindings: string[] = [];
  for (let i = 0; i < logs.length; i += EXHAUSTIVE_CHUNK_DAYS) {
    const batchNum = Math.floor(i / EXHAUSTIVE_CHUNK_DAYS) + 1;
    const chunk = logs.slice(i, i + EXHAUSTIVE_CHUNK_DAYS);
    const chunkFirst = chunk[0].match(/^## (\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
    const chunkLast = chunk[chunk.length - 1].match(/^## (\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
    const searchWindow = `Searching logs from ${chunkFirst} to ${chunkLast} (batch ${batchNum})`;
    console.log(`[search] exhaustive: batch ${batchNum}/${totalBatches} (${chunk.length} logs, ${chunkFirst}..${chunkLast})`);

    const userPrompt = buildUserPrompt(query, chunk, githubContext, searchWindow);
    const aiStart = Date.now();
    const result = await callCopilot(systemPrompt, userPrompt, model, SEARCH_TIMEOUT_MS);
    const found = result.trim() !== NEED_MORE_CONTEXT;
    console.log(`[search] exhaustive: batch ${batchNum}/${totalBatches} AI call took ${Date.now() - aiStart}ms, found=${found}`);

    if (found) {
      partialFindings.push(result);
    }
  }

  console.log(`[search] exhaustive: ${partialFindings.length}/${totalBatches} batches had findings`);

  if (partialFindings.length === 0) {
    return NextResponse.json({
      answer:
        "I searched through all available work logs but couldn't find information relevant to your question.",
      daysSearched,
      exhausted: true,
      searchMode: 'exhaustive' as SearchMode,
    });
  }

  if (partialFindings.length === 1) {
    return NextResponse.json({
      answer: partialFindings[0],
      daysSearched,
      exhausted: true,
      searchMode: 'exhaustive' as SearchMode,
    });
  }

  // Consolidation call to merge partial findings
  console.log(`[search] exhaustive: merging ${partialFindings.length} partial findings`);
  const mergePrompt = `You were asked: "${query}"

Below are findings from searching different time periods of work logs. Merge them into a single comprehensive answer. Remove duplicates, keep chronological order, and preserve all unique instances.

${partialFindings.map((f, i) => `### Findings batch ${i + 1}\n${f}`).join('\n\n')}`;

  const mergeStart = Date.now();
  const merged = await callCopilot(
    buildSystemPrompt(todayDate, 'exhaustive'),
    mergePrompt,
    model,
    SEARCH_TIMEOUT_MS,
  );
  console.log(`[search] exhaustive: merge call took ${Date.now() - mergeStart}ms`);

  return NextResponse.json({
    answer: merged,
    daysSearched,
    exhausted: true,
    searchMode: 'exhaustive' as SearchMode,
  });
}

/**
 * Date-bounded search: load only the specified date range and search once.
 */
async function searchDateBounded(
  query: string,
  model: string,
  todayDate: string,
  startDate: string,
  endDate: string,
) {
  console.log(`[search] date_bounded: ${startDate} to ${endDate}`);
  const logs = await loadLogsForRange(startDate, endDate);
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const daysSearched = Math.ceil(
    (end.getTime() - start.getTime()) / 86400000,
  ) + 1;

  if (logs.length === 0) {
    console.log(`[search] date_bounded: no logs found`);
    return NextResponse.json({
      answer: `I couldn't find any work logs between ${startDate} and ${endDate}.`,
      daysSearched,
      exhausted: true,
      searchMode: 'date_bounded' as SearchMode,
    });
  }

  const totalChars = logs.reduce((sum, l) => sum + l.length, 0);
  console.log(`[search] date_bounded: loaded ${logs.length} logs, ${totalChars} chars`);
  const allUrls = await collectUrlsFromLogs(logs);
  const githubContext = await fetchGitHubContext(Array.from(allUrls));
  console.log(`[search] date_bounded: ${allUrls.size} GitHub URLs, ${githubContext.length} context items`);
  const searchWindow = `Searching from ${startDate} to ${endDate} (${daysSearched} days)`;
  const systemPrompt = buildSystemPrompt(todayDate, 'date_bounded');
  const userPrompt = buildUserPrompt(query, logs, githubContext, searchWindow);
  const aiStart = Date.now();
  const result = await callCopilot(systemPrompt, userPrompt, model, SEARCH_TIMEOUT_MS);
  console.log(`[search] date_bounded: AI call took ${Date.now() - aiStart}ms, response ${result.length} chars`);

  const answer =
    result.trim() === NEED_MORE_CONTEXT
      ? `I searched logs from ${startDate} to ${endDate} but couldn't find information relevant to your question.`
      : result;

  return NextResponse.json({
    answer,
    daysSearched,
    exhausted: true,
    searchMode: 'date_bounded' as SearchMode,
  });
}

/**
 * Recent-first search: iterative windowed approach, stops on first answer.
 * This is the original search strategy, ideal for recency-biased queries.
 */
async function searchRecentFirst(
  query: string,
  model: string,
  todayDate: string,
  today: Date,
  offsetDays: number,
) {
  console.log(`[search] recent_first: starting from offset ${offsetDays} days`);
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
    console.log(`[search] recent_first: iter ${iter + 1}/${MAX_ITERATIONS_PER_REQUEST}, window ${startStr}..${endStr}, +${newLogs.length} logs (total ${allLogs.length})`);

    for (const log of newLogs) {
      const urls = await extractGitHubUrls(log);
      urls.forEach((u) => allUrls.add(u));
    }

    if (allLogs.length === 0 && daysSearched < MAX_LOOKBACK_DAYS) {
      continue;
    }

    if (allLogs.length === 0) {
      console.log(`[search] recent_first: no logs found after ${daysSearched} days`);
      return NextResponse.json({
        answer:
          "I couldn't find any work logs in the searched time period. There may not be any logs recorded for those dates.",
        daysSearched,
        exhausted: true,
        searchMode: 'recent_first' as SearchMode,
      });
    }

    const githubContext = await fetchGitHubContext(Array.from(allUrls));
    const totalChars = allLogs.reduce((sum, l) => sum + l.length, 0);
    const searchWindow = `Searching from ${formatDate(
      new Date(today.getTime() - daysSearched * 86400000),
    )} to ${todayDate} (${daysSearched} days)`;

    const systemPrompt = buildSystemPrompt(todayDate, 'recent_first');
    const userPrompt = buildUserPrompt(
      query,
      allLogs,
      githubContext,
      searchWindow,
    );

    console.log(`[search] recent_first: AI call with ${totalChars} chars, ${githubContext.length} context items`);
    const aiStart = Date.now();
    const result = await callCopilot(systemPrompt, userPrompt, model, SEARCH_TIMEOUT_MS);
    const needMore = result.trim() === NEED_MORE_CONTEXT;
    console.log(`[search] recent_first: AI call took ${Date.now() - aiStart}ms, needMore=${needMore}`);

    if (needMore) {
      if (daysSearched >= MAX_LOOKBACK_DAYS) {
        console.log(`[search] recent_first: exhausted all ${MAX_LOOKBACK_DAYS} days, no answer`);
        return NextResponse.json({
          answer:
            "I searched through a full year of work logs but couldn't find information relevant to your question. The answer may not be in your recorded logs.",
          daysSearched,
          exhausted: true,
          searchMode: 'recent_first' as SearchMode,
        });
      }
      if (iter === MAX_ITERATIONS_PER_REQUEST - 1) {
        console.log(`[search] recent_first: hit iteration limit at ${daysSearched} days, pausing`);
        return NextResponse.json({
          answer: null,
          daysSearched,
          exhausted: false,
          searchMode: 'recent_first' as SearchMode,
        });
      }
      continue;
    }

    answer = result;
    console.log(`[search] recent_first: found answer at ${daysSearched} days`);
    break;
  }

  return NextResponse.json({
    answer:
      answer ??
      "I couldn't find information relevant to your question in the searched logs.",
    daysSearched,
    exhausted: daysSearched >= MAX_LOOKBACK_DAYS,
    searchMode: 'recent_first' as SearchMode,
  });
}

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const { query, model, todayDate, offsetDays = 0 } = await req.json();
    console.log(`[search] query="${query}" model=${model} offsetDays=${offsetDays}`);

    if (!query || !todayDate) {
      return NextResponse.json(
        { error: 'Missing query or todayDate' },
        { status: 400 },
      );
    }

    const today = new Date(todayDate + 'T12:00:00');

    // Classify the query to determine optimal search strategy
    const classifyStart = Date.now();
    const classification = await classifySearchQuery(query, todayDate, model);
    console.log(`[search] classified as ${classification.mode} in ${Date.now() - classifyStart}ms`, classification.startDate ? `range=${classification.startDate}..${classification.endDate}` : '');

    let response: Response;

    switch (classification.mode) {
      case 'exhaustive':
        response = await searchExhaustive(query, model, todayDate, today);
        break;

      case 'date_bounded': {
        const startDate =
          classification.startDate ?? formatDate(new Date(today.getTime() - 14 * 86400000));
        const endDate = classification.endDate ?? todayDate;

        // Validate dates and handle inverted ranges
        const parsedStart = new Date(startDate + 'T00:00:00');
        const parsedEnd = new Date(endDate + 'T00:00:00');
        if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
          console.log(`[search] invalid dates from classifier, falling back to recent_first`);
          response = await searchRecentFirst(query, model, todayDate, today, offsetDays);
          break;
        }
        const resolvedStart = parsedStart <= parsedEnd ? startDate : endDate;
        const resolvedEnd = parsedStart <= parsedEnd ? endDate : startDate;
        response = await searchDateBounded(query, model, todayDate, resolvedStart, resolvedEnd);
        break;
      }

      case 'recent_first':
      default:
        response = await searchRecentFirst(query, model, todayDate, today, offsetDays);
        break;
    }

    console.log(`[search] completed in ${Date.now() - t0}ms`);
    return response;
  } catch (error) {
    console.error(`[search] failed after ${Date.now() - t0}ms:`, error);
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 },
    );
  }
}
