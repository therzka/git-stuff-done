import { NextResponse } from "next/server";
import { readWalks, writeWalks, type WalkSession } from "@/lib/files";

const REQUIRED_FIELDS: (keyof Omit<WalkSession, "id">)[] = [
  "startedAt",
  "endedAt",
  "durationSec",
  "distanceMi",
  "steps",
  "avgSpeedMph",
  "maxSpeedMph",
];

export async function GET() {
  const walks = await readWalks();
  walks.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return NextResponse.json(walks);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (body[field] === undefined || body[field] === null) {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 400 },
      );
    }
  }

  if (typeof body.startedAt !== "string" || typeof body.endedAt !== "string") {
    return NextResponse.json(
      { error: "startedAt and endedAt must be strings" },
      { status: 400 },
    );
  }

  for (const field of ["durationSec", "distanceMi", "steps", "avgSpeedMph", "maxSpeedMph"] as const) {
    if (typeof body[field] !== "number") {
      return NextResponse.json(
        { error: `${field} must be a number` },
        { status: 400 },
      );
    }
  }

  const walks = await readWalks();

  // Reject duplicates: same startedAt already exists
  if (walks.some((w) => w.startedAt === body.startedAt)) {
    return NextResponse.json({ error: "Duplicate session" }, { status: 409 });
  }

  const session: WalkSession = {
    id: crypto.randomUUID(),
    startedAt: body.startedAt as string,
    endedAt: body.endedAt as string,
    durationSec: body.durationSec as number,
    distanceMi: body.distanceMi as number,
    steps: body.steps as number,
    avgSpeedMph: body.avgSpeedMph as number,
    maxSpeedMph: body.maxSpeedMph as number,
  };
  walks.push(session);
  await writeWalks(walks);
  return NextResponse.json(session, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const walks = await readWalks();
  const filtered = walks.filter((w) => w.id !== id);
  if (filtered.length === walks.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await writeWalks(filtered);
  return NextResponse.json({ ok: true });
}
