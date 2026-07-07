import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getBillMeetingAvailability } from '@/lib/services/bill-meeting-booking';

export const dynamic = 'force-dynamic';

/** Live availability for bill-analysis discovery calls (Josh / Joe / Bryan). */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const days = Math.min(21, Math.max(1, Number(new URL(request.url).searchParams.get('days') ?? '10') || 10));
  const availability = await getBillMeetingAvailability(days, false);

  return NextResponse.json(availability);
}
