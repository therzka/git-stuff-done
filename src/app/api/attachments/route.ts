import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readdir } from "fs/promises";
import path from "path";
import { getDataRoot, isValidDate } from "@/lib/files";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 100);
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  if (!date || !isValidDate(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const dir = path.join(getDataRoot(), "attachments", date);
  try {
    const files = await readdir(dir);
    const urls = files
      .filter((f) => /\.(jpe?g|png|gif|webp|svg)$/i.test(f))
      .sort()
      .map((f) => `/api/attachments/${date}/${f}`);
    return NextResponse.json({ files: urls });
  } catch {
    return NextResponse.json({ files: [] });
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const date = formData.get("date") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!date || !isValidDate(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type" },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 10MB)" },
      { status: 400 },
    );
  }

  const dir = path.join(getDataRoot(), "attachments", date);
  await mkdir(dir, { recursive: true });

  const sanitized = sanitizeFilename(file.name || "image");
  const filename = `${Date.now()}-${sanitized}`;
  const filepath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  return NextResponse.json({ url: `/api/attachments/${date}/${filename}` });
}
