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

interface StoredPromptEntry {
  id: string;
  label?: string;
  value?: string;
  deleted?: boolean;
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

async function readStoredEntries(): Promise<StoredPromptEntry[]> {
  try {
    const raw = await readFile(promptsPath, "utf-8");
    if (!raw.trim()) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredPromptEntry => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof (item as StoredPromptEntry).id === "string"
      );
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeStoredEntries(entries: StoredPromptEntry[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(promptsPath, JSON.stringify(entries, null, 2), "utf-8");
}

/** Merge stored entries with builtins: overrides replace, tombstones hide, custom appended. */
function mergePrompts(entries: StoredPromptEntry[]): SummaryPrompt[] {
  const builtinIds = new Set(BUILTIN_PROMPTS.map((p) => p.id));
  const overrides = new Map<string, StoredPromptEntry>();
  const tombstones = new Set<string>();
  const custom: StoredPromptEntry[] = [];

  for (const entry of entries) {
    if (entry.deleted) {
      tombstones.add(entry.id);
    } else if (builtinIds.has(entry.id)) {
      overrides.set(entry.id, entry);
    } else {
      custom.push(entry);
    }
  }

  const builtins = BUILTIN_PROMPTS.filter((p) => !tombstones.has(p.id)).map((p) => {
    const override = overrides.get(p.id);
    return {
      id: p.id,
      label: override?.label ?? p.label,
      value: override?.value ?? p.value,
      is_builtin: true,
    };
  });

  const customPrompts: SummaryPrompt[] = custom
    .filter((c) => !tombstones.has(c.id))
    .map((c) => ({
      id: c.id,
      label: c.label ?? "",
      value: c.value ?? "",
      is_builtin: false,
    }));

  return [...builtins, ...customPrompts];
}

export async function GET() {
  const entries = await readStoredEntries();
  return NextResponse.json({ prompts: mergePrompts(entries) });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { label?: unknown; value?: unknown };
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";

  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  if (!value) return NextResponse.json({ error: "Value is required" }, { status: 400 });

  const entries = await readStoredEntries();
  const allPrompts = mergePrompts(entries);
  const normalizedLabel = label.toLowerCase();
  if (allPrompts.some((p) => p.label.trim().toLowerCase() === normalizedLabel)) {
    return NextResponse.json({ error: "A prompt with this label already exists" }, { status: 409 });
  }

  const newEntry: StoredPromptEntry = { id: crypto.randomUUID(), label, value };
  entries.push(newEntry);
  await writeStoredEntries(entries);

  return NextResponse.json({ prompt: { ...newEntry, is_builtin: false } });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as { id?: unknown; label?: unknown; value?: unknown };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 });

  const builtinIds = new Set(BUILTIN_PROMPTS.map((p) => p.id));
  const entries = await readStoredEntries();

  if (builtinIds.has(id)) {
    // Check if builtin values match defaults (no change needed for override)
    const existing = entries.findIndex((e) => e.id === id && !e.deleted);
    if (existing >= 0) {
      entries[existing] = { id, label, value };
    } else {
      entries.push({ id, label, value });
    }
  } else {
    const idx = entries.findIndex((e) => e.id === id && !e.deleted);
    if (idx < 0) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    entries[idx] = { id, label, value };
  }

  await writeStoredEntries(entries);
  const isBuiltin = builtinIds.has(id);
  return NextResponse.json({ prompt: { id, label, value, is_builtin: isBuiltin } });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const builtinIds = new Set(BUILTIN_PROMPTS.map((p) => p.id));
  const entries = await readStoredEntries();

  if (builtinIds.has(id)) {
    // Tombstone the builtin (also remove any override entry for it)
    const filtered = entries.filter((e) => e.id !== id);
    filtered.push({ id, deleted: true });
    await writeStoredEntries(filtered);
  } else {
    await writeStoredEntries(entries.filter((e) => e.id !== id));
  }

  return NextResponse.json({ ok: true });
}

/** Returns the original value of a built-in prompt by id, for reset functionality. */
export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const builtin = BUILTIN_PROMPTS.find((p) => p.id === id);
  if (!builtin) return NextResponse.json({ error: "Not a built-in prompt" }, { status: 404 });

  // Remove any override/tombstone for this builtin, restoring it to default
  const entries = await readStoredEntries();
  await writeStoredEntries(entries.filter((e) => e.id !== id));

  return NextResponse.json({ prompt: builtin });
}
