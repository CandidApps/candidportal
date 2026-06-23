import type { SupplierGuide, SupplierGuideCategory } from '@/lib/supplier-guides-types';

export type DbSupplierGuideRow = {
  id: number;
  provider_id: number;
  title: string;
  content: string;
  category: string;
  visible_in_portal: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DbGuideWithProvider = DbSupplierGuideRow & {
  solution_providers: {
    id: number;
    slug: string;
    name: string;
    display_name: string | null;
  };
};

export function guideIdFromDb(id: number): string {
  return `guide-${id}`;
}

export function parseGuideDbId(id: string): number | null {
  const m = /^guide-(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

export function mapGuideRow(row: DbGuideWithProvider): SupplierGuide {
  const provider = row.solution_providers;
  return {
    id: guideIdFromDb(row.id),
    providerId: provider.slug,
    providerDbId: provider.id,
    providerName: provider.display_name ?? provider.name,
    title: row.title,
    content: row.content,
    category: row.category as SupplierGuideCategory,
    visibleInPortal: row.visible_in_portal,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
