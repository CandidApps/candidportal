import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import {
  deleteAgentSourcingRule,
  loadAgentSourcingRules,
  upsertAgentSourcingRule,
  type PartnerSplitShare,
} from '@/lib/services/internal-agent-sourcing-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const admin = createSupabaseAdminClient();
    const rules = await loadAgentSourcingRules(admin);
    return NextResponse.json({ rules });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load sourcing rules';
    if (/internal_agent_sourcing/.test(message)) {
      return NextResponse.json({ rules: [], migrationRequired: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const agentMergeKey = typeof raw.agentMergeKey === 'string' ? raw.agentMergeKey.trim() : '';
  if (!agentMergeKey) {
    return NextResponse.json({ error: 'agentMergeKey is required' }, { status: 400 });
  }

  const partnerSplits: PartnerSplitShare[] = Array.isArray(raw.partnerSplits)
    ? raw.partnerSplits
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const profileId = typeof row.profileId === 'string' ? row.profileId.trim() : '';
          const percent = typeof row.percent === 'number' ? row.percent : Number(row.percent);
          if (!profileId || !Number.isFinite(percent)) return null;
          return { profileId, percent: Math.min(100, Math.max(0, percent)) };
        })
        .filter((s): s is PartnerSplitShare => s != null)
    : [];

  try {
    const admin = createSupabaseAdminClient();
    await upsertAgentSourcingRule(admin, {
      agentMergeKey,
      label: typeof raw.label === 'string' ? raw.label.trim() : null,
      sourcedByProfileId:
        typeof raw.sourcedByProfileId === 'string' ? raw.sourcedByProfileId.trim() : null,
      partnerSplits,
    });
    const rules = await loadAgentSourcingRules(admin);
    return NextResponse.json({ rules });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save sourcing rule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const agentMergeKey = searchParams.get('agentMergeKey')?.trim() ?? '';
  if (!agentMergeKey) {
    return NextResponse.json({ error: 'agentMergeKey is required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    await deleteAgentSourcingRule(admin, agentMergeKey);
    const rules = await loadAgentSourcingRules(admin);
    return NextResponse.json({ rules });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete sourcing rule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
