import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeZohoEventUrl } from '@/lib/calendar/zoho-calendar';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function normalizeMeetingDescription(html: string): string {
  return html.replace(
    /href=(["'])https?:\/\/tel:([^"']+)\1/gi,
    (_m, q: string, rest: string) => `href=${q}tel:${rest}${q}`,
  );
}

export async function GET() {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('admin_meeting_settings')
    .select('meeting_link, dialpad_number, meeting_description')
    .eq('user_id', userId)
    .maybeSingle();
  if (error && !/admin_meeting_settings/.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    meetingLink: data?.meeting_link ?? '',
    dialpadNumber: data?.dialpad_number ?? '',
    meetingDescription: data?.meeting_description ?? '',
  });
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    meetingLink?: string;
    dialpadNumber?: string;
    meetingDescription?: string;
  };

  const rawLink = (body.meetingLink ?? '').trim();
  const meetingLink = normalizeZohoEventUrl(rawLink) ?? rawLink;
  const dialpadNumber = (body.dialpadNumber ?? '').trim();
  const meetingDescription = normalizeMeetingDescription(body.meetingDescription ?? '');

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('admin_meeting_settings').upsert(
    {
      user_id: userId,
      meeting_link: meetingLink,
      dialpad_number: dialpadNumber,
      meeting_description: meetingDescription,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, meetingLink, dialpadNumber, meetingDescription });
}
