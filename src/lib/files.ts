import { readFile, writeFile, mkdir, access, readdir, unlink } from "fs/promises";
import path from "path";

// --- Types ---

export type TodoItem = {
  id: string;
  title: string;
  done: boolean;
  source: "manual" | "suggested";
  createdAt: string;
};

export type AppConfig = {
  ignoredRepos: string[];
  fontSize: string;
};

// --- Paths ---

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate that a date string is a safe YYYY-MM-DD format (prevents path traversal). */
export function isValidDate(date: string): boolean {
  return DATE_RE.test(date);
}

export function getDataRoot(): string {
  const dir = process.env.GIT_STUFF_DONE_DATA_DIR;
  if (!dir) return process.cwd();
  // Expand ~ to home directory
  if (dir.startsWith("~/") || dir === "~") {
    return path.join(process.env.HOME || "/", dir.slice(1));
  }
  return dir;
}

function dataRoot(): string {
  return getDataRoot();
}

const logsDir = () => path.join(dataRoot(), "logs");
const summariesDir = () => path.join(dataRoot(), "summaries");
const dataDir = () => path.join(dataRoot(), "data");

export function getLogPath(date: string): string {
  return path.join(logsDir(), `${date}.md`);
}

export function getSummaryPath(filename: string): string {
  return path.join(summariesDir(), filename);
}

export function getRichLogPath(date: string): string {
  return path.join(logsDir(), `${date}.rich.md`);
}

export function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

// --- Directory bootstrapping ---

async function ensureDirs(): Promise<void> {
  await mkdir(logsDir(), { recursive: true });
  await mkdir(summariesDir(), { recursive: true });
  await mkdir(dataDir(), { recursive: true });
}

// --- Log I/O ---

export async function readLog(date: string): Promise<string> {
  try {
    return await readFile(getLogPath(date), "utf-8");
  } catch {
    return "";
  }
}

export async function writeLog(date: string, content: string): Promise<void> {
  await ensureDirs();
  await writeFile(getLogPath(date), content, "utf-8");
}

export async function readRichLog(date: string): Promise<string> {
  try {
    return await readFile(getRichLogPath(date), "utf-8");
  } catch {
    return "";
  }
}

export async function writeRichLog(
  date: string,
  content: string,
): Promise<void> {
  await ensureDirs();
  await writeFile(getRichLogPath(date), content, "utf-8");
}

// --- Summary I/O ---

export async function writeSummary(filename: string, content: string): Promise<string> {
  await ensureDirs();
  
  let finalFilename = filename;
  let counter = 1;
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);

  while (true) {
    try {
      await access(getSummaryPath(finalFilename));
      // File exists, try next increment
      finalFilename = `${base}-${counter}${ext}`;
      counter++;
    } catch {
      // File does not exist, we can use this name
      break;
    }
  }

  await writeFile(getSummaryPath(finalFilename), content, "utf-8");
  return finalFilename;
}

// --- Todo I/O ---

function todosPath(): string {
  return path.join(dataDir(), "todos.json");
}

export async function readTodos(): Promise<TodoItem[]> {
  try {
    const raw = await readFile(todosPath(), "utf-8");
    return JSON.parse(raw) as TodoItem[];
  } catch {
    return [];
  }
}

export async function writeTodos(todos: TodoItem[]): Promise<void> {
  await ensureDirs();
  await writeFile(todosPath(), JSON.stringify(todos, null, 2), "utf-8");
}

// --- Config I/O ---

function configPath(): string {
  return path.join(dataDir(), "config.json");
}

const defaultConfig: AppConfig = { ignoredRepos: [], fontSize: '1' };

export async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(configPath(), "utf-8");
    return { ...defaultConfig, ...JSON.parse(raw) } as AppConfig;
  } catch {
    return { ...defaultConfig };
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  await ensureDirs();
  await writeFile(configPath(), JSON.stringify(config, null, 2), "utf-8");
}

// --- Summary browsing helpers ---

export async function listSummaries(): Promise<string[]> {
  try {
    const files = await readdir(summariesDir());
    return files
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function readSummary(filename: string): Promise<string | null> {
  try {
    return await readFile(getSummaryPath(filename), "utf-8");
  } catch {
    return null;
  }
}

export async function deleteSummary(filename: string): Promise<boolean> {
  try {
    await unlink(getSummaryPath(filename));
    return true;
  } catch {
    return false;
  }
}
