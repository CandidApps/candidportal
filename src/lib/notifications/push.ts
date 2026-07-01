import 'server-only';
import webpush from 'web-push';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Web Push (VAPID) delivery for admin notifications (TASK-034).
 *
 * Subscriptions are stored in `admin_push_subscriptions`; per-type opt-in lives
 * in `admin_notification_preferences.preferences` keyed as `${type}.push`.
 */

let configured: boolean | null = null;

/** True when VAPID keys are present and the web-push client is initialized. */
export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || 'mailto:support@candid.solutions',
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Deep-link opened when the notification is clicked. */
  url?: string;
  /** Notification tag — same tag replaces an existing banner. */
  tag?: string;
};

type StoredSubscription = {
  id: string;
  subscription: webpush.PushSubscription;
};

/** Has the user enabled the push channel for this notification type? */
function pushEnabledForType(
  preferences: Record<string, unknown> | null | undefined,
  type: string,
): boolean {
  if (!preferences) return false;
  return preferences[`${type}.push`] === true;
}

/**
 * Sends a push to all of an admin's registered devices for a given notification
 * `type`, but only if they've opted into push for that type. Dead subscriptions
 * (404/410) are pruned. Best-effort: never throws.
 */
export async function sendAdminPush(
  userId: string,
  type: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number; skipped?: string }> {
  if (!isPushConfigured()) return { sent: 0, pruned: 0, skipped: 'not_configured' };

  const admin = createSupabaseAdminClient();

  const { data: prefRow } = await admin
    .from('admin_notification_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  if (!pushEnabledForType(prefRow?.preferences as Record<string, unknown> | undefined, type)) {
    return { sent: 0, pruned: 0, skipped: 'opted_out' };
  }

  const { data: subs } = await admin
    .from('admin_push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId);

  const subscriptions = (subs ?? []) as StoredSubscription[];
  if (subscriptions.length === 0) return { sent: 0, pruned: 0, skipped: 'no_subscriptions' };

  const body = JSON.stringify(payload);
  const deadIds: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, body);
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          deadIds.push(row.id);
        } else {
          console.error('[push] send failed', status, (err as Error).message);
        }
      }
    }),
  );

  if (deadIds.length) {
    await admin.from('admin_push_subscriptions').delete().in('id', deadIds);
  }

  return { sent, pruned: deadIds.length };
}

/**
 * Sends a test push to every device registered for this admin, ignoring
 * per-type opt-in (so you can verify delivery after enabling push).
 */
export async function sendAdminTestPush(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number; skipped?: string }> {
  if (!isPushConfigured()) return { sent: 0, pruned: 0, skipped: 'not_configured' };

  const admin = createSupabaseAdminClient();
  const { data: subs } = await admin
    .from('admin_push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId);

  const subscriptions = (subs ?? []) as StoredSubscription[];
  if (subscriptions.length === 0) return { sent: 0, pruned: 0, skipped: 'no_subscriptions' };

  const body = JSON.stringify(payload);
  const deadIds: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, body);
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          deadIds.push(row.id);
        } else {
          console.error('[push] test send failed', status, (err as Error).message);
        }
      }
    }),
  );

  if (deadIds.length) {
    await admin.from('admin_push_subscriptions').delete().in('id', deadIds);
  }

  return { sent, pruned: deadIds.length };
}
