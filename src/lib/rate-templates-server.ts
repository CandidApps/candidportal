import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import type { RateTemplateRecord } from '@/lib/rate-template-types';

export type DbRateTemplateRow = {
  id: string;
  provider_id: number;
  name: string;
  rate_lines: ScheduleARateLine[];
  is_default: boolean;
  imported_from_schedule_a_at: string | null;
  updated_at: string;
};

export function rowToTemplate(slug: string, row: DbRateTemplateRow): RateTemplateRecord {
  return {
    id: row.id,
    providerId: slug,
    providerDbId: row.provider_id,
    name: row.name,
    lines: Array.isArray(row.rate_lines) ? row.rate_lines : [],
    isDefault: row.is_default,
    importedFromScheduleAAt: row.imported_from_schedule_a_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

export async function listProviderRateTemplates(
  admin: SupabaseClient,
  providerDbId: number,
  slug: string,
): Promise<RateTemplateRecord[]> {
  const { data, error } = await admin
    .from('solution_provider_rate_templates')
    .select('*')
    .eq('provider_id', providerDbId)
    .order('is_default', { ascending: false })
    .order('name');

  if (error) {
    if (error.message.includes('solution_provider_rate_templates')) return [];
    throw error;
  }

  return ((data ?? []) as DbRateTemplateRow[]).map((row) => rowToTemplate(slug, row));
}

export async function clearDefaultTemplates(admin: SupabaseClient, providerDbId: number) {
  await admin
    .from('solution_provider_rate_templates')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('provider_id', providerDbId)
    .eq('is_default', true);
}

export async function setDefaultRateTemplate(
  admin: SupabaseClient,
  providerDbId: number,
  templateId: string,
) {
  await clearDefaultTemplates(admin, providerDbId);
  const { error } = await admin
    .from('solution_provider_rate_templates')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('provider_id', providerDbId);
  if (error) throw error;
}

export async function syncLegacyOurRatesRow(
  admin: SupabaseClient,
  providerDbId: number,
  lines: ScheduleARateLine[],
  importedFromScheduleA?: boolean,
) {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    provider_id: providerDbId,
    rate_lines: lines,
    updated_at: now,
  };
  if (importedFromScheduleA) {
    payload.imported_from_schedule_a_at = now;
  }
  await admin.from('solution_provider_our_rates').upsert(payload, { onConflict: 'provider_id' });
}
