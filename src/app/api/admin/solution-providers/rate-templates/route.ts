import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { resolveProviderDbId } from '@/lib/solution-providers-db';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import type { RateTemplateRecord } from '@/lib/rate-template-types';
import {
  clearDefaultTemplates,
  listProviderRateTemplates,
  rowToTemplate,
  setDefaultRateTemplate,
  syncLegacyOurRatesRow,
  type DbRateTemplateRow,
} from '@/lib/rate-templates-server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

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
      return NextResponse.json({ templates: [] });
    }

    const templates = await listProviderRateTemplates(admin, provider.id, provider.slug);
    return NextResponse.json({ templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Load failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      providerId?: string;
      name?: string;
      lines?: ScheduleARateLine[];
      isDefault?: boolean;
      importedFromScheduleA?: boolean;
    };

    if (!body.providerId?.trim() || !body.name?.trim()) {
      return NextResponse.json({ error: 'providerId and name required' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const provider = await resolveProviderDbId(admin, body.providerId);
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const lines = body.lines ?? [];

    const { count } = await admin
      .from('solution_provider_rate_templates')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', provider.id);

    const isFirst = !count;
    const makeDefault = Boolean(body.isDefault) || isFirst;

    if (makeDefault) {
      await clearDefaultTemplates(admin, provider.id);
    }

    const { data, error } = await admin
      .from('solution_provider_rate_templates')
      .insert({
        provider_id: provider.id,
        name: body.name.trim(),
        rate_lines: lines,
        is_default: makeDefault,
        imported_from_schedule_a_at: body.importedFromScheduleA ? now : null,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = data as DbRateTemplateRow;

    if (row.is_default) {
      await syncLegacyOurRatesRow(admin, provider.id, lines, body.importedFromScheduleA);
    }

    return NextResponse.json({
      template: rowToTemplate(provider.slug, row),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      templateId?: string;
      name?: string;
      lines?: ScheduleARateLine[];
      isDefault?: boolean;
      importedFromScheduleA?: boolean;
    };

    if (!body.templateId?.trim()) {
      return NextResponse.json({ error: 'templateId required' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: existing, error: loadErr } = await admin
      .from('solution_provider_rate_templates')
      .select('*, solution_providers!inner(slug)')
      .eq('id', body.templateId)
      .maybeSingle();

    if (loadErr || !existing) {
      return NextResponse.json({ error: loadErr?.message ?? 'Template not found' }, { status: 404 });
    }

    const row = existing as DbRateTemplateRow & { solution_providers: { slug: string } };
    const slug = row.solution_providers.slug;
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = { updated_at: now };

    if (body.name?.trim()) payload.name = body.name.trim();
    if (body.lines) payload.rate_lines = body.lines;
    if (body.importedFromScheduleA) payload.imported_from_schedule_a_at = now;

    if (body.isDefault) {
      await setDefaultRateTemplate(admin, row.provider_id, row.id);
    }

    const { data, error } = await admin
      .from('solution_provider_rate_templates')
      .update(payload)
      .eq('id', body.templateId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let updated = data as DbRateTemplateRow;
    if (body.isDefault) {
      updated = { ...updated, is_default: true };
    }

    if (updated.is_default) {
      await syncLegacyOurRatesRow(
        admin,
        updated.provider_id,
        (body.lines ?? updated.rate_lines) as ScheduleARateLine[],
        body.importedFromScheduleA,
      );
    }

    return NextResponse.json({ template: rowToTemplate(slug, updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const templateId = new URL(request.url).searchParams.get('templateId')?.trim();
  if (!templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: existing, error: loadErr } = await admin
      .from('solution_provider_rate_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle();

    if (loadErr || !existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const row = existing as DbRateTemplateRow;
    const wasDefault = row.is_default;

    const { error } = await admin.from('solution_provider_rate_templates').delete().eq('id', templateId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (wasDefault) {
      const { data: next } = await admin
        .from('solution_provider_rate_templates')
        .select('*')
        .eq('provider_id', row.provider_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (next) {
        await setDefaultRateTemplate(admin, row.provider_id, (next as DbRateTemplateRow).id);
        await syncLegacyOurRatesRow(
          admin,
          row.provider_id,
          (next as DbRateTemplateRow).rate_lines,
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
