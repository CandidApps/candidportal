import { NextResponse } from 'next/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { getMyRole } from '@/lib/auth/roles';
import {
  deleteInternalCommissionParticipant,
  loadInternalCommissionParticipants,
  upsertInternalCommissionParticipant,
} from '@/lib/services/internal-commission-participants-db';
import type {
  InternalParticipantPatch,
  InternalParticipantStatus,
  InternalParticipantType,
} from '@/lib/team/internal-participant-types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const PARTICIPANT_TYPES: InternalParticipantType[] = ['partner', 'internal_employee', 'inactive'];
const STATUSES: InternalParticipantStatus[] = ['active', 'inactive'];

function parsePatch(body: unknown): InternalParticipantPatch | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const patch: InternalParticipantPatch = {};

  if (typeof raw.participantType === 'string' && PARTICIPANT_TYPES.includes(raw.participantType as InternalParticipantType)) {
    patch.participantType = raw.participantType as InternalParticipantType;
  }
  if (typeof raw.defaultHouseSharePercent === 'number' && Number.isFinite(raw.defaultHouseSharePercent)) {
    patch.defaultHouseSharePercent = Math.min(100, Math.max(0, raw.defaultHouseSharePercent));
  }
  if (raw.houseShareRateOfNet === null) {
    patch.houseShareRateOfNet = null;
  } else if (typeof raw.houseShareRateOfNet === 'number' && Number.isFinite(raw.houseShareRateOfNet)) {
    patch.houseShareRateOfNet = Math.min(100, Math.max(0, raw.houseShareRateOfNet));
  }
  if (raw.optionalAgentCommId === null) {
    patch.optionalAgentCommId = null;
  } else if (typeof raw.optionalAgentCommId === 'string') {
    patch.optionalAgentCommId = raw.optionalAgentCommId.trim() || null;
  }
  if (typeof raw.notes === 'string') patch.notes = raw.notes.trim();
  if (typeof raw.status === 'string' && STATUSES.includes(raw.status as InternalParticipantStatus)) {
    patch.status = raw.status as InternalParticipantStatus;
  }

  return Object.keys(patch).length ? patch : null;
}

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const [participants, roster] = await Promise.all([
      loadInternalCommissionParticipants(admin),
      listAdminTeamMembers(admin),
    ]);
    return NextResponse.json({ participants, roster });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load team participants';
    if (/internal_commission_participants/.test(message)) {
      return NextResponse.json({ participants: [], roster: [], migrationRequired: true });
    }
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

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const profileId = typeof raw.profileId === 'string' ? raw.profileId.trim() : '';
  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
  }

  const patch = parsePatch(raw.patch ?? raw);
  if (!patch) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    await upsertInternalCommissionParticipant(admin, profileId, {
      participantType: 'partner',
      defaultHouseSharePercent: 0,
      status: 'active',
      ...patch,
    });
    const participants = await loadInternalCommissionParticipants(admin);
    return NextResponse.json({ participants });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save team participant';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const profileId = typeof raw.profileId === 'string' ? raw.profileId.trim() : '';
  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
  }

  const participantType =
    typeof raw.participantType === 'string' &&
    PARTICIPANT_TYPES.includes(raw.participantType as InternalParticipantType)
      ? (raw.participantType as InternalParticipantType)
      : 'partner';

  const defaultHouseSharePercent =
    typeof raw.defaultHouseSharePercent === 'number' && Number.isFinite(raw.defaultHouseSharePercent)
      ? Math.min(100, Math.max(0, raw.defaultHouseSharePercent))
      : 0;

  try {
    const admin = createSupabaseAdminClient();
    await upsertInternalCommissionParticipant(admin, profileId, {
      participantType,
      defaultHouseSharePercent,
      status: 'active',
    });
    const participants = await loadInternalCommissionParticipants(admin);
    return NextResponse.json({ participants });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add team participant';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get('profileId')?.trim() ?? '';
  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    await deleteInternalCommissionParticipant(admin, profileId);
    const participants = await loadInternalCommissionParticipants(admin);
    return NextResponse.json({ participants });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove team participant';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
