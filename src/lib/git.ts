import { execFileSync } from "child_process";
import { getTodayDate, getDataRoot } from "./files";

export function commitWorkLog(
  message?: string,
): { committed: boolean; message: string } {
  const cwd = getDataRoot();

  // Stage logs/, summaries/ and data/ directories individually to avoid partial failure
  const dirs = ["logs", "data", "summaries", "attachments"];
  for (const dir of dirs) {
    try {
      execFileSync("git", ["add", dir], { cwd });
    } catch (e) {
      // Ignore if directory doesn't exist or is empty
    }
  }

  // Check if there is anything staged to commit
  const status = execFileSync("git", ["diff", "--cached", "--name-only"], {
    cwd,
    encoding: "utf-8",
  }).trim();

  if (!status) {
    return { committed: false, message: "Nothing to commit" };
  }

  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace("T", " ");
  const commitMessage = message ?? `Update work log ${timestamp}`;

  execFileSync("git", ["commit", "-m", commitMessage], { cwd });

  // Push to remote if configured
  try {
    execFileSync("git", ["push"], { cwd });
  } catch {
    // Push may fail if no remote is set; commit still succeeded
  }

  return { committed: true, message: commitMessage };
}

export function isNewDay(lastDate: string): boolean {
  return getTodayDate() !== lastDate;
}
