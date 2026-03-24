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
  pullRequestState: 'OPEN' | 'MERGED' | 'CLOSED' | null;
  pullRequestUrl: string | null;
  taskUrl: string;
  createdAt: string;
  updatedAt: string;
};

const GH_FIELDS = [
  'id',
  'name',
  'repository',
  'state',
  'pullRequestNumber',
  'pullRequestState',
  'pullRequestUrl',
  'createdAt',
  'updatedAt',
].join(',');

type RawTask = Omit<AgentSession, 'taskUrl'>;

async function fetchTasks(limit: number): Promise<RawTask[]> {
  if (limit < 5) throw new Error('Minimum limit reached with no successful response');
  try {
    const { stdout } = await execAsync(
      `gh agent-task list --json ${GH_FIELDS} --limit ${limit}`,
      { env: { ...process.env, NO_COLOR: '1' } }
    );
    return JSON.parse(stdout) as RawTask[];
  } catch (err) {
    // A corrupted/inaccessible task in the result set causes gh to fail entirely.
    // Retry with a smaller window to skip past the bad record.
    const isGhError = err instanceof Error && err.message.includes('Could not resolve');
    if (isGhError) {
      console.warn(`[sessions] gh failed at limit=${limit}, retrying with limit=${Math.floor(limit / 2)}`);
      return fetchTasks(Math.floor(limit / 2));
    }
    throw err;
  }
}

export async function GET() {
  try {
    const raw = await fetchTasks(30);
    const sessions: AgentSession[] = raw
      .filter((s) => s.pullRequestState !== 'MERGED')
      .map((s) => ({
        ...s,
        taskUrl: s.repository
          ? `https://github.com/${s.repository}/tasks/${s.id}`
          : `https://github.com/copilot/agents/${s.id}`,
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
