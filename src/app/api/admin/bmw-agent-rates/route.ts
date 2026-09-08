import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { BmwAgentRate } from '@/lib/bmw/types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function slugifyAgentId(name: string): string {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 16);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AGT${base || 'NEW'}${suffix}`;
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    commissionRate?: number;
    id?: string;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const rate =
    typeof body.commissionRate === 'number' && Number.isFinite(body.commissionRate)
      ? body.commissionRate
      : Number(body.commissionRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return NextResponse.json({ error: 'commissionRate must be 0–100' }, { status: 400 });
  }

  const agentCommId = body.id?.trim() || slugifyAgentId(name);
  const rateData: BmwAgentRate = {
    rowNum: 0,
    email: body.email?.trim() ?? '',
    name,
    id: agentCommId,
    commissionRate: rate,
    overridePartner: '',
    overrideRate: null,
    tempRate: null,
    tempRateEndDate: '',
    tempRateDetermine: '',
  };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('bmw_agent_rates').upsert(
    {
      agent_comm_id: agentCommId,
      rate_data: rateData,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'agent_comm_id' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: rateData });
}
