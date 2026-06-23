import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import type { MerchantAnalysisProvider } from '@/lib/analysis/types';
import { listProviderRateTemplates } from '@/lib/rate-templates-server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type DbRow = {
  id: number;
  slug: string;
  name: string;
  display_name: string | null;
};

export async function loadMerchantAnalysisProviders(): Promise<MerchantAnalysisProvider[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('solution_providers')
    .select('id, slug, name, display_name')
    .eq('provider_category', 'merchant_services')
    .eq('include_rates_in_analysis', true)
    .order('name');

  if (error) {
    if (error.message.includes('include_rates_in_analysis')) {
      return [];
    }
    throw new Error(error.message);
  }

  const providers: MerchantAnalysisProvider[] = [];

  for (const row of (data ?? []) as DbRow[]) {
    const templates = await listProviderRateTemplates(admin, row.id, row.slug);
    const defaultTemplate = templates.find((t) => t.isDefault) ?? templates[0];
    const lines = defaultTemplate?.lines ?? [];
    if (!lines.length) continue;

    providers.push({
      id: row.slug,
      name: row.name,
      displayName: row.display_name ?? undefined,
      lines,
      defaultRateTemplateId: defaultTemplate?.id,
      defaultRateTemplateName: defaultTemplate?.name,
    });
  }

  return providers;
}
