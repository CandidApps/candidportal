import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import type { OurRateRecord } from '@/lib/our-rate-types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { listProviderRateTemplates, syncLegacyOurRatesRow } from '@/lib/rate-templates-server';
import { resolveProviderDbId } from '@/lib/solution-providers-db';

/** Default template lines for a partner, or null when none configured. */
export async function loadDefaultProviderRateLines(
  providerKey: string,
): Promise<{ slug: string; lines: ScheduleARateLine[]; defaultTemplateId?: string; defaultTemplateName?: string } | null> {
  const admin = createSupabaseAdminClient();
  const provider = await resolveProviderDbId(admin, providerKey);
  if (!provider) return null;

  const templates = await listProviderRateTemplates(admin, provider.id, provider.slug);
  const chosen = templates.find((t) => t.isDefault) ?? templates[0];
  if (!chosen?.lines.length) return null;

  return {
    slug: provider.slug,
    lines: chosen.lines,
    defaultTemplateId: chosen.id,
    defaultTemplateName: chosen.name,
  };
}

/** @deprecated Use rate templates — returns default template as OurRateRecord */
export async function loadDefaultOurRateRecord(providerKey: string): Promise<OurRateRecord | null> {
  const admin = createSupabaseAdminClient();
  const provider = await resolveProviderDbId(admin, providerKey);
  if (!provider) return null;

  const templates = await listProviderRateTemplates(admin, provider.id, provider.slug);
  const chosen = templates.find((t) => t.isDefault) ?? templates[0];
  if (!chosen) return null;

  return {
    providerId: provider.slug,
    providerDbId: provider.id,
    lines: chosen.lines,
    importedFromScheduleAAt: chosen.importedFromScheduleAAt,
    updatedAt: chosen.updatedAt,
  };
}

export async function saveDefaultProviderRateLines(
  providerKey: string,
  lines: ScheduleARateLine[],
  importedFromScheduleA?: boolean,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const provider = await resolveProviderDbId(admin, providerKey);
  if (!provider) throw new Error('Provider not found');

  const templates = await listProviderRateTemplates(admin, provider.id, provider.slug);
  const chosen = templates.find((t) => t.isDefault) ?? templates[0];
  const now = new Date().toISOString();

  if (chosen) {
    await admin
      .from('solution_provider_rate_templates')
      .update({
        rate_lines: lines,
        updated_at: now,
        ...(importedFromScheduleA ? { imported_from_schedule_a_at: now } : {}),
      })
      .eq('id', chosen.id);
  }

  await syncLegacyOurRatesRow(admin, provider.id, lines, importedFromScheduleA);
}
