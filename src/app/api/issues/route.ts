import { NextResponse } from "next/server";
import { fetchMyIssues, type MyIssue } from "@/lib/github";

// Coalesce concurrent requests into a single underlying fetch — see /api/prs
// route for full rationale.
let inFlight: Promise<MyIssue[]> | null = null;

export async function GET() {
  try {
    console.log("[issues] Fetching my open issues...");
    if (!inFlight) {
      inFlight = fetchMyIssues().finally(() => {
        inFlight = null;
      });
    } else {
      console.log("[issues] Coalescing with in-flight request");
    }
    const issues = await inFlight;
    console.log("[issues] Found", issues.length, "open issues");
    return NextResponse.json(issues);
  } catch (error) {
    console.error("[issues] Failed to fetch:", error);
    return NextResponse.json([]);
  }
}
