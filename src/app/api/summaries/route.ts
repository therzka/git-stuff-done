import { NextResponse } from 'next/server';
import { listSummaries } from '@/lib/files';

export async function GET() {
  const files = await listSummaries();
  return NextResponse.json({ files: files.map((name) => ({ name })) });
}
