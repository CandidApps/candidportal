import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { AgentProfileOverride } from '@/lib/agents/agent-assignments';
import type { AgentStatus } from '@/components/AgentsView';
import {
  loadAgentProfileSettings,
  upsertAgentProfileSetting,
} from '@/lib/services/agent-profile-settings-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const STATUSES: AgentStatus[] = ['active', 'pending', 'inactive'];

function parseProfile(body: unknown): { mergeKey: string; profile: AgentProfileOverride } | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const mergeKey = typeof raw.mergeKey === 'string' ? raw.mergeKey.trim() : '';
  if (!mergeKey) return null;

  const profileRaw = raw.profile;
  if (!profileRaw || typeof profileRaw !== 'object') return null;
  const p = profileRaw as Record<string, unknown>;

  const profile: AgentProfileOverride = {};
  if (typeof p.company === 'string') profile.company = p.company.trim();
  if (typeof p.primaryContactName === 'string') profile.primaryContactName = p.primaryContactName.trim();
  if (typeof p.primaryContactEmail === 'string') profile.primaryContactEmail = p.primaryContactEmail.trim();
  if (typeof p.notes === 'string') profile.notes = p.notes.trim();
  if (typeof p.status === 'string' && (STATUSES as string[]).includes(p.status)) {
    profile.status = p.status as AgentStatus;
  }
  if (p.inactiveEffectiveDate === null) {
    profile.inactiveEffectiveDate = null;
  } else if (typeof p.inactiveEffectiveDate === 'string' && p.inactiveEffectiveDate.trim()) {
    profile.inactiveEffectiveDate = p.inactiveEffectiveDate.trim().slice(0, 10);
  }
  if (typeof p.keepOverridePartners === 'boolean') {
    profile.keepOverridePartners = p.keepOverridePartners;
  }

  if (profile.status === 'inactive' && !profile.inactiveEffectiveDate) {
    return null;
  }

  return { mergeKey, profile };
}

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const profiles = await loadAgentProfileSettings(admin);
    return NextResponse.json({ profiles });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load agent profiles';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseProfile(body);
  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid profile payload (mergeKey, profile, inactive date required when inactive)' },
      { status: 400 },
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    await upsertAgentProfileSetting(admin, parsed.mergeKey, parsed.profile);
    return NextResponse.json({ ok: true, mergeKey: parsed.mergeKey, profile: parsed.profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save agent profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
