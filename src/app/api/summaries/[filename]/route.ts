import { NextResponse } from 'next/server';
import { readSummary, deleteSummary } from '@/lib/files';
import { commitWorkLog } from '@/lib/git';

function isValidFilename(filename: string): boolean {
  return filename.endsWith('.md') && !filename.includes('/') && !filename.includes('\\') && !filename.includes('..');
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!isValidFilename(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const content = await readSummary(filename);
  if (content === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ content });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!isValidFilename(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const deleted = await deleteSummary(filename);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found or could not delete' }, { status: 404 });
  }

  const commitRes = commitWorkLog(`docs(summary): remove ${filename}`);
  return NextResponse.json({ success: true, committed: commitRes.committed });
}
