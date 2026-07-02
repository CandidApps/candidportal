import 'server-only';

import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { BillMeetingSpecialist } from '@/lib/bill-meeting-scheduling';

const DEFAULT_FIRST_NAMES = ['josh', 'joe', 'bryan'];

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

function parseEnvSpecialists(): BillMeetingSpecialist[] | null {
  const raw = process.env.PORTAL_BILL_MEETING_SPECIALISTS?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Array<{ id?: string; name?: string; email?: string }>;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((row, i) => ({
        id: String(row.id ?? row.email ?? `specialist-${i}`),
        name: String(row.name ?? '').trim(),
        email: String(row.email ?? '').trim().toLowerCase(),
      }))
      .filter((s) => s.name && s.email.includes('@'));
  } catch {
    return null;
  }
}

function localDemoSpecialists(): BillMeetingSpecialist[] {
  return [
    { id: 'josh', name: 'Josh', email: 'josh@candid.solutions' },
    { id: 'joe', name: 'Joe', email: 'joe@candid.solutions' },
    { id: 'bryan', name: 'Bryan', email: 'bryan@candid.solutions' },
  ];
}

/** Josh, Joe, and Bryan — env override, else admin roster match, else demo roster in local mode. */
export async function listBillMeetingSpecialists(localMode = false): Promise<BillMeetingSpecialist[]> {
  const fromEnv = parseEnvSpecialists();
  if (fromEnv?.length) return fromEnv;

  try {
    const admin = createSupabaseAdminClient();
    const members = await listAdminTeamMembers(admin);
    const matched = members
      .filter((m) =>
        DEFAULT_FIRST_NAMES.some((n) => m.displayName.trim().toLowerCase().startsWith(n)),
      )
      .map((m) => ({
        id: m.id,
        name: firstName(m.displayName),
        email: m.email.toLowerCase(),
      }));
    if (matched.length) return matched;
  } catch {
    /* fall through */
  }

  return localMode ? localDemoSpecialists() : [];
}

export async function findBillMeetingSpecialistById(
  specialistId: string,
  localMode = false,
): Promise<BillMeetingSpecialist | null> {
  const specialists = await listBillMeetingSpecialists(localMode);
  return specialists.find((s) => s.id === specialistId) ?? null;
}

export async function findUserIdForSpecialistEmail(email: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const normalized = email.trim().toLowerCase();
  const { data } = await admin.from('profiles').select('id').eq('email', normalized).maybeSingle();
  return data?.id ? String(data.id) : null;
}
