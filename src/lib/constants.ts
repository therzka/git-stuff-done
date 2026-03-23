/** Comma-separated GitHub orgs parsed from the GITHUB_ORG env var. */
export const GITHUB_ORGS: string[] = (process.env.GITHUB_ORG || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** @deprecated Use GITHUB_ORGS instead. Kept for backward compatibility. */
export const GITHUB_ORG = GITHUB_ORGS[0] ?? '';

/** The login used in API calls to assign the Copilot coding agent. */
export const COPILOT_AGENT_LOGIN = "copilot-swe-agent[bot]";

const COPILOT_LOGINS = new Set(["copilot", "copilot-swe-agent", "copilot-swe-agent[bot]"]);

/** Check if a GitHub login belongs to the Copilot coding agent (case-insensitive). */
export function isCopilotLogin(login: string): boolean {
  return COPILOT_LOGINS.has(login.toLowerCase());
}
