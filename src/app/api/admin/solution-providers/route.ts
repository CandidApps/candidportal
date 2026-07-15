import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import {
  mapDbToRecord,
  slugifyProviderName,
  type DbSolutionProvider,
  type DbSolutionProviderContact,
  type DbSolutionProviderSolution,
  type DbSolutionProviderSolutionRate,
} from '@/lib/solution-providers-db';
import type { SolutionProviderRecord } from '@/lib/solution-providers-types';
import { normalizeTagList } from '@/lib/solutions/find-solutions-tags';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function providerPersistFields(record: SolutionProviderRecord) {
  return {
    name: record.name.trim(),
    display_name: record.displayName?.trim() || null,
    website: record.website?.trim() || null,
    notes: record.notes?.trim() || null,
    logo_url: record.logoUrl?.trim() || null,
    logo_storage_path: record.logoStoragePath?.trim() || null,
    description: record.description?.trim() || null,
    candid_recommended: Boolean(record.candidRecommended),
    find_capabilities: normalizeTagList(record.findCapabilities),
    find_services: normalizeTagList(record.findServices),
    provider_category: record.providerCategory ?? null,
    include_rates_in_analysis: record.includeRatesInAnalysis ?? false,
  };
}

async function loadAllRecords(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const [providersRes, contactsRes, solutionsRes, ratesRes] = await Promise.all([
    admin.from('solution_providers').select('*').order('name'),
    admin.from('solution_provider_contacts').select('*'),
    admin.from('solution_provider_solutions').select('*'),
    admin.from('solution_provider_solution_rates').select('*'),
  ]);

  if (providersRes.error) throw new Error(providersRes.error.message);
  if (contactsRes.error) throw new Error(contactsRes.error.message);
  if (solutionsRes.error) throw new Error(solutionsRes.error.message);
  if (ratesRes.error) throw new Error(ratesRes.error.message);

  const providers = (providersRes.data ?? []) as DbSolutionProvider[];
  const contacts = (contactsRes.data ?? []) as DbSolutionProviderContact[];
  const solutions = (solutionsRes.data ?? []) as DbSolutionProviderSolution[];
  const rates = (ratesRes.data ?? []) as DbSolutionProviderSolutionRate[];

  return providers.map((p) => mapDbToRecord(p, contacts, solutions, rates));
}

async function upsertProvider(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  record: SolutionProviderRecord,
  opts?: { skipReload?: boolean },
): Promise<SolutionProviderRecord> {
  const slug = slugifyProviderName(record.name) || record.id;
  const now = new Date().toISOString();

  let providerId = record.dbId ?? null;
  if (providerId) {
    const { error } = await admin
      .from('solution_providers')
      .update({
        slug,
        ...providerPersistFields(record),
        updated_at: now,
      })
      .eq('id', providerId);
    if (error) throw new Error(error.message);
  } else {
    const existing = await admin
      .from('solution_providers')
      .select('id')
      .ilike('slug', slug)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    if (existing.data?.id) {
      providerId = existing.data.id as number;
      const { error } = await admin
        .from('solution_providers')
        .update({
          ...providerPersistFields(record),
          updated_at: now,
        })
        .eq('id', providerId);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await admin
        .from('solution_providers')
        .insert({
          slug,
          ...providerPersistFields(record),
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      providerId = data.id as number;
    }
  }

  await admin.from('solution_provider_contacts').delete().eq('provider_id', providerId);
  await admin.from('solution_provider_solutions').delete().eq('provider_id', providerId);

  for (const contact of record.contacts) {
    const { error } = await admin.from('solution_provider_contacts').insert({
      provider_id: providerId,
      name: contact.name.trim(),
      role: contact.role?.trim() ?? '',
      email: contact.email?.trim() ?? '',
      phone: contact.phone?.trim() ?? '',
      is_primary: contact.isPrimary,
      client_facing: contact.clientFacing ?? false,
      notes: contact.notes?.trim() || null,
    });
    if (error) throw new Error(error.message);
  }

  for (const solution of record.solutions) {
    const { data: solRow, error: solErr } = await admin
      .from('solution_provider_solutions')
      .insert({
        provider_id: providerId,
        name: solution.name.trim(),
        description: solution.description?.trim() || null,
      })
      .select('id')
      .single();
    if (solErr) throw new Error(solErr.message);

    const solutionId = solRow.id as number;
    for (const [paySource, rate] of Object.entries(solution.partnerRates)) {
      if (!Number.isFinite(rate)) continue;
      const { error: rateErr } = await admin.from('solution_provider_solution_rates').insert({
        solution_id: solutionId,
        pay_source: paySource.toLowerCase(),
        rate_pct: rate,
      });
      if (rateErr) throw new Error(rateErr.message);
    }
  }

  if (opts?.skipReload) {
    return {
      ...record,
      id: slug,
      dbId: providerId,
      fromBmwOnly: false,
      updatedAt: now,
    };
  }

  const all = await loadAllRecords(admin);
  const saved = all.find((p) => p.dbId === providerId);
  if (!saved) throw new Error('Failed to reload saved provider');
  return saved;
}

async function bulkUpsertProviders(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  records: SolutionProviderRecord[],
): Promise<number> {
  let imported = 0;
  for (const record of records) {
    await upsertProvider(admin, { ...record, fromBmwOnly: false }, { skipReload: true });
    imported += 1;
  }
  return imported;
}

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const records = await loadAllRecords(admin);
    return NextResponse.json(records);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load solution providers';
    if (message.includes('solution_providers')) {
      return NextResponse.json({ error: 'Run migration 0009_solution_providers.sql first', records: [] });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as { name?: string; displayName?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const record: SolutionProviderRecord = {
      id: slugifyProviderName(body.name),
      name: body.name.trim(),
      displayName: body.displayName?.trim(),
      contacts: [],
      solutions: [],
      createdAt: now,
      updatedAt: now,
    };
    const saved = await upsertProvider(admin, record);
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create provider' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as SolutionProviderRecord;
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const saved = await upsertProvider(admin, body);
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save provider' },
      { status: 500 },
    );
  }
}

/** Bulk import from localStorage migration */
export async function PUT(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    records?: SolutionProviderRecord[];
    includeBmwStubs?: boolean;
  };
  if (!body.records?.length) {
    return NextResponse.json({ imported: 0, records: [] });
  }

  try {
    const admin = createSupabaseAdminClient();
    const toImport = body.records.filter(
      (record) => !record.fromBmwOnly || body.includeBmwStubs,
    );
    const imported = await bulkUpsertProviders(admin, toImport);
    const records = await loadAllRecords(admin);
    return NextResponse.json({ imported, records });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import providers' },
      { status: 500 },
    );
  }
}
