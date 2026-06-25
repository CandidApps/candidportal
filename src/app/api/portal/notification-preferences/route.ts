import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  mergeNotificationPreferences,
  type MemberEmailNotificationKey,
  MEMBER_EMAIL_NOTIFICATION_KEYS,
} from '@/lib/portal/notification-preferences';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    if (error.message.includes('notification_preferences')) {
      return NextResponse.json({ preferences: mergeNotificationPreferences(null) });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    preferences: mergeNotificationPreferences(
      data?.notification_preferences as Record<string, unknown> | undefined,
    ),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    key?: MemberEmailNotificationKey;
    enabled?: boolean;
    preferences?: Record<string, boolean>;
  };

  const { data: existing } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', user.id)
    .maybeSingle();

  const current = mergeNotificationPreferences(
    existing?.notification_preferences as Record<string, unknown> | undefined,
  );

  let next = { ...current };
  if (body.preferences && typeof body.preferences === 'object') {
    for (const key of MEMBER_EMAIL_NOTIFICATION_KEYS) {
      if (typeof body.preferences[key] === 'boolean') next[key] = body.preferences[key];
    }
  } else if (body.key && MEMBER_EMAIL_NOTIFICATION_KEYS.includes(body.key)) {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled boolean required' }, { status: 400 });
    }
    next[body.key] = body.enabled;
  } else {
    return NextResponse.json({ error: 'key or preferences required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ notification_preferences: next })
    .eq('id', user.id);

  if (error) {
    if (error.message.includes('notification_preferences')) {
      return NextResponse.json({
        preferences: next,
        warning: 'Run migration 0034_member_portal_settings.sql to persist preferences',
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ preferences: next });
}
