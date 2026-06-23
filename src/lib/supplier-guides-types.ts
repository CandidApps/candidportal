export type SupplierGuideCategory = 'guide' | 'documentation' | 'faq' | 'process';

export type SupplierGuide = {
  id: string;
  providerId: string;
  providerDbId?: number;
  providerName: string;
  title: string;
  content: string;
  category: SupplierGuideCategory;
  visibleInPortal: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export const SUPPLIER_GUIDE_CATEGORY_LABELS: Record<SupplierGuideCategory, string> = {
  guide: 'Guide',
  documentation: 'Documentation',
  faq: 'FAQ',
  process: 'Process',
};
