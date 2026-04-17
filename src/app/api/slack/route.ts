import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DEMO_SLACK_THREAD } from '@/lib/demo';

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Return demo data for example.slack.com URLs (used in demo mode)
  if (url.includes('example.slack.com')) {
    return NextResponse.json({ markdown: DEMO_SLACK_THREAD });
  }

  try {
    const { stdout } = await execAsync(
      `gh slack read ${JSON.stringify(url)}`,
      { env: { ...process.env, NO_COLOR: '1' } },
    );
    return NextResponse.json({ markdown: stdout });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const notInstalled =
      msg.includes('executable file not found') ||
      msg.includes('unknown command') ||
      msg.includes('no extension') ||
      msg.includes('command not found');
    if (notInstalled) {
      return NextResponse.json(
        { error: 'gh slack extension is not installed. Run: gh extension install https://github.com/rneatherway/gh-slack' },
        { status: 503 },
      );
    }
    console.error('[slack] Failed to read thread:', msg);
    return NextResponse.json({ error: 'Failed to fetch Slack thread' }, { status: 500 });
  }
}
