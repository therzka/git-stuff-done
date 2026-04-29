import { NextRequest, NextResponse } from "next/server";
import { isValidDate, readLog } from "@/lib/files";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Remove inline base64 images: ![alt](data:image/...;base64,...) */
function stripInlineImages(content: string): string {
  return content.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, '');
}

export async function GET(request: NextRequest) {
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");

  if (!start || !isValidDate(start)) {
    return NextResponse.json({ error: "Invalid or missing start date" }, { status: 400 });
  }
  if (!end || !isValidDate(end)) {
    return NextResponse.json({ error: "Invalid or missing end date" }, { status: 400 });
  }
  if (start > end) {
    return NextResponse.json({ error: "start must be <= end" }, { status: 400 });
  }

  const sections: string[] = [];
  let daysIncluded = 0;
  let daysSkipped = 0;

  let current = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  while (current <= endDate) {
    const dateStr = toDateString(current);
    const content = await readLog(dateStr);
    if (content.trim()) {
      sections.push(`## ${dateStr}\n\n${content.trim()}\n`);
      daysIncluded++;
    } else {
      daysSkipped++;
    }
    current = addDays(current, 1);
  }

  const combined = stripInlineImages(sections.join("\n"));
  return NextResponse.json({ content: combined, daysIncluded, daysSkipped });
}
