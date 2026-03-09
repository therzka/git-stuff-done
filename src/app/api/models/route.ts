import { NextResponse } from 'next/server';
import { getModels, clearModelCache } from '@/lib/models';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get('refresh') === '1') {
      clearModelCache();
    }
    const models = await getModels();
    return NextResponse.json(models);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 },
    );
  }
}
