import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { getDataRoot } from '@/lib/files';
import path from 'path';

const MAX_RESULTS = 100;
const MAX_EXCERPTS_PER_DAY = 3;
const MAX_QUERY_LENGTH = 200;

export interface LogSearchResult {
  date: string;
  excerpts: string[];
}

function getMatchingParagraphs(content: string, query: string): string[] {
  const queryLower = query.toLowerCase();
  const paragraphs = content.split(/\n{2,}/);
  const matches: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase().includes(queryLower)) {
      matches.push(trimmed);
      if (matches.length >= MAX_EXCERPTS_PER_DAY) break;
    }
  }

  return matches;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (!q) {
    return NextResponse.json({ error: 'Missing query parameter q' }, { status: 400 });
  }

  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: 'Query too long' }, { status: 400 });
  }

  try {
    const logsDir = path.join(getDataRoot(), 'logs');
    const files = await readdir(logsDir);

    // Only raw .md files (not .rich.md), sorted newest first
    const dates = files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map((f) => f.replace('.md', ''))
      .sort()
      .reverse();

    const results: LogSearchResult[] = [];

    for (const date of dates) {
      if (results.length >= MAX_RESULTS) break;

      const filePath = path.join(logsDir, `${date}.md`);
      let content = '';
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      if (!content.trim()) continue;

      const excerpts = getMatchingParagraphs(content, q);
      if (excerpts.length > 0) {
        results.push({ date, excerpts });
      }
    }

    return NextResponse.json({ results, query: q });
  } catch {
    return NextResponse.json({ error: 'Failed to search logs' }, { status: 500 });
  }
}
