import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  mergeNotificationPreferences,
  type MemberEmailNotificationKey,
  type MemberNotificationPreferences,
} from '@/lib/portal/notification-preferences';

export async function getMemberNotificationPrefsByUserId(
  userId: string,
): Promise<MemberNotificationPreferences | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    if (error.message.includes('notification_preferences')) return null;
    console.error('[member-prefs] load by user id failed', error.message);
    return null;
  }

  return mergeNotificationPreferences(
    data?.notification_preferences as Record<string, unknown> | undefined,
  );
}

export async function getMemberNotificationPrefsByEmail(
  email: string,
): Promise<{ userId: string | null; preferences: MemberNotificationPreferences }> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { userId: null, preferences: mergeNotificationPreferences(null) };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, notification_preferences')
    .ilike('email', trimmed)
    .maybeSingle();

  if (error) {
    if (error.message.includes('notification_preferences')) {
      return { userId: null, preferences: mergeNotificationPreferences(null) };
    }
    console.error('[member-prefs] load by email failed', error.message);
    return { userId: null, preferences: mergeNotificationPreferences(null) };
  }

  return {
    userId: (data?.id as string | undefined) ?? null,
    preferences: mergeNotificationPreferences(
      data?.notification_preferences as Record<string, unknown> | undefined,
    ),
  };
}

export function isMemberEmailEnabled(
  preferences: MemberNotificationPreferences,
  key: MemberEmailNotificationKey,
): boolean {
  return preferences[key] !== false;
}
