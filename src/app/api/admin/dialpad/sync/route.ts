import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { syncDialpadCalls } from '@/lib/dialpad/sync';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const days = Number(new URL(request.url).searchParams.get('days') ?? '14') || 14;
  const result = await syncDialpadCalls(Math.min(Math.max(days, 1), 90));
  return NextResponse.json(result);
}
