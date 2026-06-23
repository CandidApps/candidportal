import { NextResponse } from 'next/server';
import path from 'path';
import { getMyRole } from '@/lib/auth/roles';
import { slugifyProviderName } from '@/lib/solution-providers-db';
import type { ScheduleARateLine, ScheduleARecord } from '@/lib/schedule-a-types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'candid_documents';

type DbScheduleARow = {
  id: string;
  provider_id: number;
  document_id: string | null;
  filename: string | null;
  storage_path: string | null;
  rate_lines: ScheduleARateLine[];
  parsed_at: string | null;
  updated_at: string;
};

async function resolveProviderDbId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  providerKey: string,
): Promise<{ id: number; slug: string } | null> {
  const slug = slugifyProviderName(providerKey);
  const { data: bySlug } = await admin
    .from('solution_providers')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (bySlug?.id) return { id: bySlug.id as number, slug: bySlug.slug as string };

  const { data: all } = await admin.from('solution_providers').select('id, slug, name');
  const key = providerKey.trim().toLowerCase();
  const match = (all ?? []).find(
    (p) =>
      String(p.slug ?? '').toLowerCase() === key ||
      String(p.name ?? '').toLowerCase() === key,
  );
  return match?.id ? { id: match.id as number, slug: String(match.slug) } : null;
}

function rowToRecord(slug: string, row: DbScheduleARow): ScheduleARecord {
  return {
    providerId: slug,
    providerDbId: row.provider_id,
    documentId: row.document_id ?? undefined,
    filename: row.filename ?? undefined,
    storagePath: row.storage_path ?? undefined,
    lines: Array.isArray(row.rate_lines) ? row.rate_lines : [],
    parsedAt: row.parsed_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providerKey = new URL(request.url).searchParams.get('providerId')?.trim();
  if (!providerKey) {
    return NextResponse.json({ error: 'providerId required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const provider = await resolveProviderDbId(admin, providerKey);
    if (!provider) {
      return NextResponse.json({ scheduleA: null });
    }

    const { data, error } = await admin
      .from('solution_provider_schedule_a')
      .select('*')
      .eq('provider_id', provider.id)
      .maybeSingle();

    if (error) {
      if (error.message.includes('solution_provider_schedule_a')) {
        return NextResponse.json({ scheduleA: null });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ scheduleA: null });
    }

    return NextResponse.json({
      scheduleA: rowToRecord(provider.slug, data as DbScheduleARow),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Load failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const providerKey = String(form.get('providerId') ?? '').trim();
    const linesJson = String(form.get('lines') ?? '[]');
    const file = form.get('file');

    if (!providerKey) {
      return NextResponse.json({ error: 'providerId required' }, { status: 400 });
    }

    let lines: ScheduleARateLine[];
    try {
      lines = JSON.parse(linesJson) as ScheduleARateLine[];
      if (!Array.isArray(lines)) throw new Error('invalid lines');
    } catch {
      return NextResponse.json({ error: 'Invalid lines JSON' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const provider = await resolveProviderDbId(admin, providerKey);
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found — save the vendor to the database first' }, { status: 404 });
    }

    let documentId: string | null = null;
    let filename: string | null = null;
    let storagePath: string | null = null;

    if (file instanceof File && file.size) {
      documentId = crypto.randomUUID();
      filename = file.name;
      const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]+/g, '_');
      storagePath = `solution-providers/${provider.slug}/schedule-a/${documentId}/${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
        contentType: file.type || 'application/pdf',
        upsert: true,
      });
      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      await admin.from('registry_documents').insert({
        id: documentId,
        entity_type: 'solution_provider',
        entity_key: provider.slug,
        document_type: 'schedule_a',
        filename: file.name,
        storage_path: storagePath,
        uploaded_by: 'Candid Team',
        file_size_label: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      });
    }

    const now = new Date().toISOString();
    const payload = {
      provider_id: provider.id,
      rate_lines: lines,
      parsed_at: now,
      updated_at: now,
      ...(documentId ? { document_id: documentId, filename, storage_path: storagePath } : {}),
    };

    const { data, error } = await admin
      .from('solution_provider_schedule_a')
      .upsert(payload, { onConflict: 'provider_id' })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      scheduleA: rowToRecord(provider.slug, data as DbScheduleARow),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      providerId?: string;
      lines?: ScheduleARateLine[];
    };

    if (!body.providerId?.trim() || !body.lines) {
      return NextResponse.json({ error: 'providerId and lines required' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const provider = await resolveProviderDbId(admin, body.providerId);
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from('solution_provider_schedule_a')
      .upsert(
        {
          provider_id: provider.id,
          rate_lines: body.lines,
          updated_at: now,
        },
        { onConflict: 'provider_id' },
      )
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      scheduleA: rowToRecord(provider.slug, data as DbScheduleARow),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
