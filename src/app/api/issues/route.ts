import { NextResponse } from "next/server";
import { fetchMyIssues } from "@/lib/github";

export async function GET() {
  try {
    console.log("[issues] Fetching my open issues...");
    const issues = await fetchMyIssues();
    console.log("[issues] Found", issues.length, "open issues");
    return NextResponse.json(issues);
  } catch (error) {
    console.error("[issues] Failed to fetch:", error);
    return NextResponse.json([]);
  }
}
