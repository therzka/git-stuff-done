import { NextResponse } from 'next/server';
import { callCopilot } from '@/lib/copilot';
import { extractGitHubUrls } from '@/lib/github';
import {
  loadLogsForRange,
  fetchGitHubContext,
  classifySearchQuery,
  preFilterLogDates,
} from '@/lib/search';
import type { GitHubContextItem, SearchMode } from '@/lib/search';

const MAX_LOOKBACK_DAYS = 365;
const WINDOW_SIZE = 7;
const MAX_ITERATIONS_PER_REQUEST = 7; // ~49 days per request to avoid timeouts
const EXHAUSTIVE_CHUNK_DAYS = 60;
const MAX_SINGLE_SHOT_CHARS = 80_000;
const SEARCH_TIMEOUT_MS = 180_000; // 3 minutes for large search prompts

/** Throw if the client has disconnected (aborted the request). */
function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    const err = new Error('Search aborted');
    err.name = 'AbortError';
    throw err;
  }
}

const NEED_MORE_CONTEXT = 'NEED_MORE_CONTEXT';

/** Response is purely a "need more context" signal (token at start, no real content before it) */
function isNeedMoreContext(result: string): boolean {
  return result.trim().startsWith(NEED_MORE_CONTEXT);
}

/** Strip the NEED_MORE_CONTEXT sentinel from AI responses so it never reaches the user */
function sanitizeResponse(result: string): string {
  const cleaned = result
    .split('\n')
    .filter(line => !line.includes(NEED_MORE_CONTEXT))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || result.replace(/`?NEED_MORE_CONTEXT`?/g, '').trim();
}

// NDJSON streaming event types
type SearchEvent =
  | { type: 'progress'; message: string; daysSearched?: number; searchMode?: SearchMode }
  | { type: 'complete'; answer: string | null; daysSearched: number; exhausted: boolean; searchMode: SearchMode }
  | { type: 'error'; error: string };

type Emit = (event: SearchEvent) => void;

function createSearchStream(
  searchFn: (emit: Emit, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit: Emit = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          closed = true;
        }
      };
      try {
        await searchFn(emit, signal);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          console.log('[search] stopped by user');
        } else if (!closed) {
          console.error('[search] stream error:', err);
          emit({ type: 'error', error: 'Failed to perform search' });
        }
      } finally {
        if (!closed) {
          try { controller.close(); } catch { /* already closed */ }
        }
      }
    },
    cancel() {
      // Client disconnected — nothing to clean up
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

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
  emit: Emit,
  signal: AbortSignal,
) {
  emit({ type: 'progress', message: 'Loading all logs...', searchMode: 'exhaustive' });
  console.log(`[search] exhaustive: loading all logs`);
  const { logs, daysSearched } = await loadAllLogs(today);
  throwIfAborted(signal);

  if (logs.length === 0) {
    console.log(`[search] exhaustive: no logs found`);
    emit({
      type: 'complete',
      answer: "I couldn't find any work logs in the searched time period. There may not be any logs recorded for those dates.",
      daysSearched,
      exhausted: true,
      searchMode: 'exhaustive',
    });
    return;
  }

  const totalChars = logs.reduce((sum, l) => sum + l.length, 0);
  console.log(`[search] exhaustive: loaded ${logs.length} logs, ${totalChars} chars`);
  emit({ type: 'progress', message: `Loaded ${logs.length} log entries, fetching GitHub context...`, daysSearched, searchMode: 'exhaustive' });
  const allUrls = await collectUrlsFromLogs(logs);
  const githubContext = await fetchGitHubContext(Array.from(allUrls));
  throwIfAborted(signal);
  console.log(`[search] exhaustive: ${allUrls.size} GitHub URLs, ${githubContext.length} context items`);
  const systemPrompt = buildSystemPrompt(todayDate, 'exhaustive');

  if (totalChars <= MAX_SINGLE_SHOT_CHARS) {
    emit({ type: 'progress', message: 'Searching with AI...', daysSearched, searchMode: 'exhaustive' });
    throwIfAborted(signal);
    console.log(`[search] exhaustive: single-shot (${totalChars} <= ${MAX_SINGLE_SHOT_CHARS})`);
    const searchWindow = `Searching ALL available logs (${daysSearched} days)`;
    const userPrompt = buildUserPrompt(query, logs, githubContext, searchWindow);
    const aiStart = Date.now();
    const result = await callCopilot(systemPrompt, userPrompt, model, SEARCH_TIMEOUT_MS);
    console.log(`[search] exhaustive: AI call took ${Date.now() - aiStart}ms, response ${result.length} chars`);

    const answer =
      isNeedMoreContext(result)
        ? "I searched through all available work logs but couldn't find information relevant to your question."
        : sanitizeResponse(result);

    emit({ type: 'complete', answer, daysSearched, exhausted: true, searchMode: 'exhaustive' });
    return;
  }

  // Batched: logs are too large, search in chunks and merge
  const totalBatches = Math.ceil(logs.length / EXHAUSTIVE_CHUNK_DAYS);
  console.log(`[search] exhaustive: batched mode — ${totalBatches} batches (${totalChars} chars > ${MAX_SINGLE_SHOT_CHARS})`);
  emit({ type: 'progress', message: `Searching in ${totalBatches} batches...`, daysSearched, searchMode: 'exhaustive' });
  const partialFindings: string[] = [];
  for (let i = 0; i < logs.length; i += EXHAUSTIVE_CHUNK_DAYS) {
    throwIfAborted(signal);
    const batchNum = Math.floor(i / EXHAUSTIVE_CHUNK_DAYS) + 1;
    const chunk = logs.slice(i, i + EXHAUSTIVE_CHUNK_DAYS);
    const chunkFirst = chunk[0].match(/^## (\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
    const chunkLast = chunk[chunk.length - 1].match(/^## (\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
    const searchWindow = `Searching logs from ${chunkFirst} to ${chunkLast} (batch ${batchNum})`;
    console.log(`[search] exhaustive: batch ${batchNum}/${totalBatches} (${chunk.length} logs, ${chunkFirst}..${chunkLast})`);
    emit({ type: 'progress', message: `Searching batch ${batchNum} of ${totalBatches}...`, daysSearched, searchMode: 'exhaustive' });

    const userPrompt = buildUserPrompt(query, chunk, githubContext, searchWindow);
    const aiStart = Date.now();
    const result = await callCopilot(systemPrompt, userPrompt, model, SEARCH_TIMEOUT_MS);
    const found = !isNeedMoreContext(result);
    console.log(`[search] exhaustive: batch ${batchNum}/${totalBatches} AI call took ${Date.now() - aiStart}ms, found=${found}`);

    if (found) {
      partialFindings.push(sanitizeResponse(result));
    }
  }

  console.log(`[search] exhaustive: ${partialFindings.length}/${totalBatches} batches had findings`);

  if (partialFindings.length === 0) {
    emit({
      type: 'complete',
      answer: "I searched through all available work logs but couldn't find information relevant to your question.",
      daysSearched,
      exhausted: true,
      searchMode: 'exhaustive',
    });
    return;
  }

  if (partialFindings.length === 1) {
    emit({ type: 'complete', answer: partialFindings[0], daysSearched, exhausted: true, searchMode: 'exhaustive' });
    return;
  }

  // Consolidation call to merge partial findings
  emit({ type: 'progress', message: 'Merging results from all batches...', daysSearched, searchMode: 'exhaustive' });
  throwIfAborted(signal);
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

  emit({ type: 'complete', answer: merged, daysSearched, exhausted: true, searchMode: 'exhaustive' });
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
  emit: Emit,
  signal: AbortSignal,
) {
  emit({ type: 'progress', message: `Loading logs from ${startDate} to ${endDate}...`, searchMode: 'date_bounded' });
  console.log(`[search] date_bounded: ${startDate} to ${endDate}`);
  const logs = await loadLogsForRange(startDate, endDate);
  throwIfAborted(signal);
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const daysSearched = Math.ceil(
    (end.getTime() - start.getTime()) / 86400000,
  ) + 1;

  if (logs.length === 0) {
    console.log(`[search] date_bounded: no logs found`);
    emit({
      type: 'complete',
      answer: `I couldn't find any work logs between ${startDate} and ${endDate}.`,
      daysSearched,
      exhausted: true,
      searchMode: 'date_bounded',
    });
    return;
  }

  const totalChars = logs.reduce((sum, l) => sum + l.length, 0);
  console.log(`[search] date_bounded: loaded ${logs.length} logs, ${totalChars} chars`);
  emit({ type: 'progress', message: `Loaded ${logs.length} log entries, searching with AI...`, daysSearched, searchMode: 'date_bounded' });
  const allUrls = await collectUrlsFromLogs(logs);
  const githubContext = await fetchGitHubContext(Array.from(allUrls));
  throwIfAborted(signal);
  console.log(`[search] date_bounded: ${allUrls.size} GitHub URLs, ${githubContext.length} context items`);
  const searchWindow = `Searching from ${startDate} to ${endDate} (${daysSearched} days)`;
  const systemPrompt = buildSystemPrompt(todayDate, 'date_bounded');
  const userPrompt = buildUserPrompt(query, logs, githubContext, searchWindow);
  const aiStart = Date.now();
  const result = await callCopilot(systemPrompt, userPrompt, model, SEARCH_TIMEOUT_MS);
  console.log(`[search] date_bounded: AI call took ${Date.now() - aiStart}ms, response ${result.length} chars`);

  const answer =
    isNeedMoreContext(result)
      ? `I searched logs from ${startDate} to ${endDate} but couldn't find information relevant to your question.`
      : sanitizeResponse(result);

  emit({ type: 'complete', answer, daysSearched, exhausted: true, searchMode: 'date_bounded' });
}

/**
 * Recent-first search: iterative windowed approach, stops on first answer.
 * Accumulates logs across iterations so the AI gets progressively more context.
 * GitHub context is cached across iterations to avoid redundant API calls.
 */
async function searchRecentFirst(
  query: string,
  model: string,
  todayDate: string,
  today: Date,
  offsetDays: number,
  emit: Emit,
  signal: AbortSignal,
) {
  emit({ type: 'progress', message: 'Searching recent logs...', daysSearched: offsetDays, searchMode: 'recent_first' });
  console.log(`[search] recent_first: starting from offset ${offsetDays} days`);
  const allLogs: string[] = [];
  let daysSearched = offsetDays;
  let answer: string | null = null;

  // Cache GitHub context across iterations to avoid re-fetching
  const githubContextCache = new Map<string, GitHubContextItem>();

  for (let iter = 0; iter < MAX_ITERATIONS_PER_REQUEST; iter++) {
    throwIfAborted(signal);
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
    emit({ type: 'progress', message: `Looked back ${daysSearched} days (${allLogs.length} log entries)...`, daysSearched, searchMode: 'recent_first' });

    if (allLogs.length === 0 && daysSearched < MAX_LOOKBACK_DAYS) {
      continue;
    }

    if (allLogs.length === 0) {
      console.log(`[search] recent_first: no logs found after ${daysSearched} days`);
      emit({
        type: 'complete',
        answer: "I couldn't find any work logs in the searched time period. There may not be any logs recorded for those dates.",
        daysSearched,
        exhausted: true,
        searchMode: 'recent_first',
      });
      return;
    }

    // Only fetch GitHub context for new URLs not already cached
    const newUrls: string[] = [];
    for (const log of newLogs) {
      const urls = await extractGitHubUrls(log);
      for (const u of urls) {
        if (!githubContextCache.has(u)) {
          newUrls.push(u);
        }
      }
    }

    if (newUrls.length > 0) {
      const newContext = await fetchGitHubContext(newUrls);
      for (const item of newContext) {
        githubContextCache.set(item.url, item);
      }
    }

    emit({ type: 'progress', message: `Searching with AI (${daysSearched} days so far)...`, daysSearched, searchMode: 'recent_first' });
    throwIfAborted(signal);

    const allGithubContext = Array.from(githubContextCache.values());
    const totalChars = allLogs.reduce((sum, l) => sum + l.length, 0);
    const searchWindow = `Searching from ${formatDate(
      new Date(today.getTime() - daysSearched * 86400000),
    )} to ${todayDate} (${daysSearched} days)`;

    const systemPrompt = buildSystemPrompt(todayDate, 'recent_first');
    const userPrompt = buildUserPrompt(
      query,
      allLogs,
      allGithubContext,
      searchWindow,
    );

    console.log(`[search] recent_first: AI call with ${totalChars} chars, ${allGithubContext.length} context items`);
    const aiStart = Date.now();
    const result = await callCopilot(systemPrompt, userPrompt, model, SEARCH_TIMEOUT_MS);
    const needMore = result.includes(NEED_MORE_CONTEXT);
    console.log(`[search] recent_first: AI call took ${Date.now() - aiStart}ms, needMore=${needMore}`);

    if (needMore) {
      if (daysSearched >= MAX_LOOKBACK_DAYS) {
        console.log(`[search] recent_first: exhausted all ${MAX_LOOKBACK_DAYS} days, no answer`);
        emit({
          type: 'complete',
          answer: "I searched through a full year of work logs but couldn't find information relevant to your question. The answer may not be in your recorded logs.",
          daysSearched,
          exhausted: true,
          searchMode: 'recent_first',
        });
        return;
      }
      if (iter === MAX_ITERATIONS_PER_REQUEST - 1) {
        console.log(`[search] recent_first: hit iteration limit at ${daysSearched} days, pausing`);
        emit({
          type: 'complete',
          answer: null,
          daysSearched,
          exhausted: false,
          searchMode: 'recent_first',
        });
        return;
      }
      continue;
    }

    answer = sanitizeResponse(result);
    console.log(`[search] recent_first: found answer at ${daysSearched} days`);
    break;
  }

  emit({
    type: 'complete',
    answer: answer ?? "I couldn't find information relevant to your question in the searched logs.",
    daysSearched,
    exhausted: daysSearched >= MAX_LOOKBACK_DAYS,
    searchMode: 'recent_first',
  });
}

/**
 * Keyword pre-filter search: extract keywords, text-search for candidate days,
 * then run a single AI call on only those days. Falls back to normal classification
 * if pre-filter yields no results.
 */
async function searchWithKeywordPrefilter(
  query: string,
  model: string,
  todayDate: string,
  today: Date,
  offsetDays: number,
  emit: Emit,
  signal: AbortSignal,
) {
  emit({ type: 'progress', message: 'Extracting keywords…', searchMode: 'recent_first' });
  console.log(`[search] keyword_prefilter: extracting keywords for query="${query}"`);

  const candidateDates = await preFilterLogDates(query, model);
  throwIfAborted(signal);

  if (!candidateDates || candidateDates.length === 0) {
    console.log('[search] keyword_prefilter: no candidate dates, falling back to normal search');
    emit({ type: 'progress', message: 'No keyword matches found, falling back to full search…' });
    const classification = await classifySearchQuery(query, todayDate, model);
    throwIfAborted(signal);
    switch (classification.mode) {
      case 'exhaustive':
        return searchExhaustive(query, model, todayDate, today, emit, signal);
      case 'date_bounded': {
        const startDate = classification.startDate ?? formatDate(new Date(today.getTime() - 14 * 86400000));
        const endDate = classification.endDate ?? todayDate;
        return searchDateBounded(query, model, todayDate, startDate, endDate, emit, signal);
      }
      default:
        return searchRecentFirst(query, model, todayDate, today, offsetDays, emit, signal);
    }
  }

  console.log(`[search] keyword_prefilter: ${candidateDates.length} candidate days found`);
  emit({ type: 'progress', message: `Found ${candidateDates.length} candidate day${candidateDates.length !== 1 ? 's' : ''} via keyword match, searching with AI…`, daysSearched: candidateDates.length, searchMode: 'recent_first' });

  // Load logs for only the candidate dates
  const logs: string[] = [];
  for (const date of candidateDates) {
    const dayLogs = await loadLogsForRange(date, date);
    logs.push(...dayLogs);
  }
  throwIfAborted(signal);

  if (logs.length === 0) {
    emit({ type: 'complete', answer: "I couldn't find any work logs for the matched dates.", daysSearched: candidateDates.length, exhausted: true, searchMode: 'recent_first' });
    return;
  }

  const allUrls = await collectUrlsFromLogs(logs);
  const githubContext = await fetchGitHubContext(Array.from(allUrls));
  throwIfAborted(signal);

  const systemPrompt = buildSystemPrompt(todayDate, 'exhaustive');
  const searchWindow = `Keyword pre-filter: ${candidateDates.length} matched day${candidateDates.length !== 1 ? 's' : ''}`;
  const userPrompt = buildUserPrompt(query, logs, githubContext, searchWindow);

  const aiStart = Date.now();
  const result = await callCopilot(systemPrompt, userPrompt, model, SEARCH_TIMEOUT_MS);
  console.log(`[search] keyword_prefilter: AI call took ${Date.now() - aiStart}ms`);

  const answer = isNeedMoreContext(result)
    ? "I found days matching your keywords but couldn't find a specific answer to your question in them."
    : sanitizeResponse(result);

  emit({ type: 'complete', answer, daysSearched: candidateDates.length, exhausted: true, searchMode: 'recent_first' });
}

export async function POST(req: Request) {
  const t0 = Date.now();

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const {
    query,
    model,
    todayDate,
    offsetDays = 0,
    useKeywordPrefilter = false,
    startDate,
    endDate,
  } = body;
  console.log(`[search] query="${query}" model=${model} offsetDays=${offsetDays} useKeywordPrefilter=${useKeywordPrefilter}`);

  if (!query || !todayDate) {
    return NextResponse.json(
      { error: 'Missing query or todayDate' },
      { status: 400 },
    );
  }

  const today = new Date(todayDate + 'T12:00:00');

  return createSearchStream(async (emit, signal) => {
    if (useKeywordPrefilter) {
      await searchWithKeywordPrefilter(query, model, todayDate, today, offsetDays, emit, signal);
    } else if (startDate && endDate) {
      console.log(`[search] explicit date range: ${startDate} to ${endDate}`);
      await searchDateBounded(query, model, todayDate, startDate, endDate, emit, signal);
    } else {
      emit({ type: 'progress', message: 'Classifying query...' });
      const classifyStart = Date.now();
      const classification = await classifySearchQuery(query, todayDate);
      throwIfAborted(signal);
      console.log(`[search] classified as ${classification.mode} in ${Date.now() - classifyStart}ms`, classification.startDate ? `range=${classification.startDate}..${classification.endDate}` : '');

      switch (classification.mode) {
        case 'exhaustive':
          await searchExhaustive(query, model, todayDate, today, emit, signal);
          break;

        case 'date_bounded': {
          const startDate =
            classification.startDate ?? formatDate(new Date(today.getTime() - 14 * 86400000));
          const endDate = classification.endDate ?? todayDate;

          const parsedStart = new Date(startDate + 'T00:00:00');
          const parsedEnd = new Date(endDate + 'T00:00:00');
          if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
            console.log(`[search] invalid dates from classifier, falling back to recent_first`);
            await searchRecentFirst(query, model, todayDate, today, offsetDays, emit, signal);
            break;
          }
          const resolvedStart = parsedStart <= parsedEnd ? startDate : endDate;
          const resolvedEnd = parsedStart <= parsedEnd ? endDate : startDate;
          await searchDateBounded(query, model, todayDate, resolvedStart, resolvedEnd, emit, signal);
          break;
        }

        case 'recent_first':
        default:
          await searchRecentFirst(query, model, todayDate, today, offsetDays, emit, signal);
          break;
      }
    }

    console.log(`[search] completed in ${Date.now() - t0}ms`);
  }, req.signal);
}
