import { NextRequest, NextResponse } from "next/server";
import { readConfig, writeConfig } from "@/lib/files";

export async function GET() {
  const config = await readConfig();
  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const config = await readConfig();

  if (Array.isArray(body.ignoredRepos)) {
    config.ignoredRepos = body.ignoredRepos
      .filter((r: unknown) => typeof r === "string")
      .map((r: string) => r.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 100);
  }

  if (typeof body.preferredModel === "string") {
    config.preferredModel = body.preferredModel.trim().slice(0, 200) || undefined;
  }

  await writeConfig(config);
  return NextResponse.json(config);
}
