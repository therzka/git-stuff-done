import { NextRequest, NextResponse } from "next/server";
import { fetchOrgRepos } from "@/lib/github";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const q = searchParams.get("q") || "";

    console.log(`[repos] Fetching org repos page=${page} q=${q || "(none)"}`);
    const result = await fetchOrgRepos({ page, query: q || undefined });
    console.log(`[repos] Found ${result.repos.length} repos, hasMore=${result.hasMore}`);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[repos] Failed to fetch:", error);
    return NextResponse.json({ repos: [], hasMore: false });
  }
}
