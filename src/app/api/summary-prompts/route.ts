import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getDataRoot } from "@/lib/files";

export interface SummaryPrompt {
  id: string;
  label: string;
  value: string;
  is_builtin: boolean;
}

interface CustomSummaryPrompt {
  id: string;
  label: string;
  value: string;
}

const BUILTIN_PROMPTS: SummaryPrompt[] = [
  {
    id: "daily-standup",
    label: "Daily Standup",
    value:
      "Summarize my work for a daily standup meeting. Focus on what was completed, what is in progress, and any blockers.",
    is_builtin: true,
  },
  {
    id: "weekly-report",
    label: "Weekly Report",
    value:
      "Create a weekly report summarizing key achievements, PRs merged, and tasks completed. Group by project or topic.",
    is_builtin: true,
  },
  {
    id: "detailed-changelog",
    label: "Detailed Changelog",
    value: "List all technical changes, bug fixes, and refactors in a changelog format.",
    is_builtin: true,
  },
  {
    id: "ai-usage",
    label: "AI Usage",
    value:
      "Summarize how I used AI tools this past week. Include mentions of Copilot, AI-generated code, AI-assisted debugging, pair programming with AI, and any AI-related workflow patterns. Note which tasks AI helped with and how.",
    is_builtin: true,
  },
];

const dataDir = path.join(getDataRoot(), "data");
const promptsPath = path.join(dataDir, "summary-prompts.json");

async function readCustomPrompts(): Promise<CustomSummaryPrompt[]> {
  try {
    const raw = await readFile(promptsPath, "utf-8");
    if (!raw.trim()) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is CustomSummaryPrompt => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        typeof item.value === "string"
      );
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeCustomPrompts(prompts: CustomSummaryPrompt[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(promptsPath, JSON.stringify(prompts, null, 2), "utf-8");
}

export async function GET() {
  const customPrompts = await readCustomPrompts();
  return NextResponse.json({
    prompts: [
      ...BUILTIN_PROMPTS,
      ...customPrompts.map((prompt) => ({ ...prompt, is_builtin: false })),
    ],
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { label?: unknown; value?: unknown };
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";

  if (!label) {
    return NextResponse.json({ error: "Label is required" }, { status: 400 });
  }

  if (!value) {
    return NextResponse.json({ error: "Value is required" }, { status: 400 });
  }

  const prompts = await readCustomPrompts();
  const normalizedLabel = label.toLowerCase();
  if (prompts.some((prompt) => prompt.label.trim().toLowerCase() === normalizedLabel)) {
    return NextResponse.json({ error: "A prompt with this label already exists" }, { status: 409 });
  }

  const prompt = {
    id: crypto.randomUUID(),
    label,
    value,
  };

  prompts.push(prompt);
  await writeCustomPrompts(prompts);

  return NextResponse.json({ prompt: { ...prompt, is_builtin: false } });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (BUILTIN_PROMPTS.some((prompt) => prompt.id === id)) {
    return NextResponse.json({ error: "Cannot delete built-in prompts" }, { status: 403 });
  }

  const prompts = await readCustomPrompts();
  await writeCustomPrompts(prompts.filter((prompt) => prompt.id !== id));

  return NextResponse.json({ ok: true });
}
