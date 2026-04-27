import { NextResponse } from 'next/server';
import { fetchMyPRs, type MyPullRequest } from '@/lib/github';

// Coalesce concurrent requests into a single underlying fetch.
// GitHub's Search API silently returns 0 results when hit with concurrent
// calls from the same token, so we must avoid duplicate fetches triggered
// by StrictMode double-invokes, panel remounts, or polling races.
let inFlight: Promise<MyPullRequest[]> | null = null;

export async function GET() {
  try {
    console.log("[prs] Fetching my open PRs...");
    if (!inFlight) {
      inFlight = fetchMyPRs().finally(() => {
        inFlight = null;
      });
    } else {
      console.log("[prs] Coalescing with in-flight request");
    }
    const prs = await inFlight;
    console.log("[prs] Found", prs.length, "open PRs");
    return NextResponse.json(prs);
  } catch (error) {
    console.error("[prs] Failed to fetch:", error);
    return NextResponse.json([]);
  }
}
