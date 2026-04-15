import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import path from "path";
import { getDataRoot } from "@/lib/files";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function validateSegments(segments: string[]): boolean {
  return !segments.some((s) => s === ".." || s.includes("/"));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path;

  if (!validateSegments(segments)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const filepath = path.join(getDataRoot(), "attachments", ...segments);
  const ext = path.extname(filepath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const data = await readFile(filepath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path;

  if (!validateSegments(segments)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const filepath = path.join(getDataRoot(), "attachments", ...segments);

  try {
    await unlink(filepath);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
