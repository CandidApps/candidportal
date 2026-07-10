import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCustomerMeetings } from '@/lib/assistant/data';

export const dynamic = 'force-dynamic';

/**
 * Meetings whose organizer/attendees include any of the given contact emails.
 * Used by the account Communications panel.
 */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const emails = (searchParams.get('emails') ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (!emails.length) {
    return NextResponse.json({
      connected: true,
      calendarScope: true,
      meetings: [],
    });
  }

  const result = await loadCustomerMeetings(user.id, emails);
  return NextResponse.json(result);
}
