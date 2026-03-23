import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type AgentSession = {
  id: string;
  name: string;
  repository: string | null;
  state: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

const GH_FIELDS = [
  'id',
  'name',
  'repository',
  'state',
  'pullRequestNumber',
  'createdAt',
  'updatedAt',
].join(',');

export async function GET() {
  try {
    const { stdout } = await execAsync(
      `gh agent-task list --json ${GH_FIELDS} --limit 100`,
      { env: { ...process.env, NO_COLOR: '1' } }
    );

    const raw: Array<Omit<AgentSession, 'pullRequestUrl'>> = JSON.parse(stdout);
    const sessions: AgentSession[] = raw.map((s) => ({
      ...s,
      pullRequestUrl:
        s.repository && s.pullRequestNumber
          ? `https://github.com/${s.repository}/pull/${s.pullRequestNumber}`
          : null,
    }));
    console.log(`[sessions] Returning ${sessions.length} agent tasks`);
    return NextResponse.json(sessions);
  } catch (err) {
    const isNotFound =
      err instanceof Error &&
      (err.message.includes('executable file not found') ||
        err.message.includes('command not found'));
    console.error('[sessions] Failed to fetch agent tasks:', err);
    return NextResponse.json([], { status: isNotFound ? 503 : 500 });
  }
}
