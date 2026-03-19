export const GITHUB_ORG = process.env.GITHUB_ORG || '';

/** The login used in API calls to assign the Copilot coding agent. */
export const COPILOT_AGENT_LOGIN = "copilot-swe-agent[bot]";

const COPILOT_LOGINS = new Set(["copilot", "copilot-swe-agent", "copilot-swe-agent[bot]"]);

/** Check if a GitHub login belongs to the Copilot coding agent (case-insensitive). */
export function isCopilotLogin(login: string): boolean {
  return COPILOT_LOGINS.has(login.toLowerCase());
}
