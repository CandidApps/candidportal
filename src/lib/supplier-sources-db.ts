import type { SupplierSource } from '@/lib/supplier-sources-types';

export type DbSupplierSourceRow = {
  id: number;
  provider_id: number;
  title: string;
  url: string;
  source_type: string;
  visible_in_portal: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DbSourceWithProvider = DbSupplierSourceRow & {
  solution_providers: {
    id: number;
    slug: string;
    name: string;
    display_name: string | null;
  };
};

export function sourceIdFromDb(id: number): string {
  return `source-${id}`;
}

export function parseSourceDbId(id: string): number | null {
  const m = /^source-(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

export function mapSourceRow(row: DbSourceWithProvider): SupplierSource {
  const provider = row.solution_providers;
  return {
    id: sourceIdFromDb(row.id),
    providerId: provider.slug,
    providerDbId: provider.id,
    providerName: provider.display_name ?? provider.name,
    title: row.title,
    url: row.url,
    sourceType: row.source_type,
    visibleInPortal: row.visible_in_portal,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
