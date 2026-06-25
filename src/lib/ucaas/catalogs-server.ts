import type { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { UcaasCatalog, UcaasCatalogRecord } from '@/lib/ucaas/types';
import { BUILTIN_UCAAS_CATALOGS } from '@/lib/ucaas/vonage-catalog';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type DbUcaasCatalogRow = {
  id: string;
  provider_id: number;
  name: string;
  catalog: UcaasCatalog;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export function rowToCatalogRecord(
  providerSlug: string,
  providerName: string,
  row: DbUcaasCatalogRow,
): UcaasCatalogRecord {
  return {
    id: row.id,
    providerId: providerSlug,
    providerDbId: row.provider_id,
    providerName,
    name: row.name,
    catalog: row.catalog,
    isDefault: row.is_default,
    updatedAt: row.updated_at,
  };
}

export async function clearDefaultCatalogs(admin: Admin, providerId: number): Promise<void> {
  await admin
    .from('solution_provider_ucaas_catalogs')
    .update({ is_default: false })
    .eq('provider_id', providerId)
    .eq('is_default', true);
}

export async function setDefaultCatalog(
  admin: Admin,
  providerId: number,
  catalogId: string,
): Promise<void> {
  await clearDefaultCatalogs(admin, providerId);
  await admin
    .from('solution_provider_ucaas_catalogs')
    .update({ is_default: true })
    .eq('id', catalogId);
}

/** List catalogs for a provider, auto-seeding a built-in default (e.g. Vonage) if empty. */
export async function listProviderCatalogs(
  admin: Admin,
  providerId: number,
  providerSlug: string,
  providerName: string,
): Promise<UcaasCatalogRecord[]> {
  const { data, error } = await admin
    .from('solution_provider_ucaas_catalogs')
    .select('*')
    .eq('provider_id', providerId)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as DbUcaasCatalogRow[];

  if (rows.length === 0) {
    const builtin = BUILTIN_UCAAS_CATALOGS[providerSlug.toLowerCase()];
    if (builtin) {
      const now = new Date().toISOString();
      const { data: inserted, error: insErr } = await admin
        .from('solution_provider_ucaas_catalogs')
        .insert({
          provider_id: providerId,
          name: builtin.name,
          catalog: builtin.catalog,
          is_default: true,
          updated_at: now,
        })
        .select('*')
        .single();
      if (!insErr && inserted) rows = [inserted as DbUcaasCatalogRow];
    }
  }

  return rows.map((row) => rowToCatalogRecord(providerSlug, providerName, row));
}

export async function getProviderName(admin: Admin, providerId: number): Promise<string> {
  const { data } = await admin
    .from('solution_providers')
    .select('name, display_name')
    .eq('id', providerId)
    .maybeSingle();
  return (data?.display_name as string) || (data?.name as string) || 'Provider';
}
