import { NextRequest, NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { GITHUB_ORG } from "@/lib/constants";

type CachedMember = {
  login: string;
  avatarUrl: string;
};

type OrgCache = {
  members: CachedMember[];
  fetchedAt: number;
  loading: Promise<CachedMember[]> | null;
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, OrgCache>();

async function loadAllMembers(org: string): Promise<CachedMember[]> {
  const octokit = await getOctokit();
  const members: CachedMember[] = [];
  for (let page = 1; ; page++) {
    const { data } = await octokit.orgs.listMembers({ org, per_page: 100, page });
    for (const m of data) {
      members.push({ login: m.login, avatarUrl: m.avatar_url });
    }
    if (data.length < 100) break;
  }
  return members;
}

function getOrgCache(org: string): OrgCache {
  let entry = cache.get(org);
  if (!entry) {
    entry = { members: [], fetchedAt: 0, loading: null };
    cache.set(org, entry);
  }
  return entry;
}

/** Start a background fetch if the cache is stale. Non-blocking. */
function ensureFresh(org: string): void {
  const entry = getOrgCache(org);
  if (entry.loading) return; // already fetching
  if (entry.members.length && Date.now() - entry.fetchedAt < CACHE_TTL_MS) return; // still fresh

  entry.loading = loadAllMembers(org)
    .then((members) => {
      entry.members = members;
      entry.fetchedAt = Date.now();
      return members;
    })
    .finally(() => { entry.loading = null; });
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const org = request.nextUrl.searchParams.get("org") || GITHUB_ORG;
  const preload = request.nextUrl.searchParams.has("preload");

  if (!org) {
    return NextResponse.json({ error: "No org configured" }, { status: 400 });
  }

  const entry = getOrgCache(org);

  // Preload: kick off fetch and return immediately
  if (preload) {
    ensureFresh(org);
    const status = entry.members.length ? "ready" : "loading";
    return NextResponse.json({ status, count: entry.members.length });
  }

  // If cache is empty, we must wait for the first load
  if (!entry.members.length) {
    if (!entry.loading) ensureFresh(org);
    if (entry.loading) await entry.loading;
  } else {
    // Refresh in background if stale — return current data immediately
    ensureFresh(org);
  }

  if (!query) {
    return NextResponse.json({ members: [] });
  }

  const filtered = entry.members
    .filter((m) => m.login.toLowerCase().includes(query))
    .slice(0, 20)
    .map((m) => ({
      login: m.login,
      avatarUrl: m.avatarUrl,
      profileUrl: `https://github.com/${m.login}`,
    }));

  return NextResponse.json({ members: filtered });
}
