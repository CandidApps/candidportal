import matrixData from '@/lib/solutions/supplier-matrix.json';
import {
  CATALOG_SUPPLIERS,
  SOLUTION_CATEGORIES,
  type CatalogSupplier,
  type SolutionCategoryId,
} from '@/lib/solutions/catalog';

export type MatrixFeaturePill = { label: string; offered: boolean };

export type MatrixCard = {
  name: string;
  stack: string;
  minSeats: string;
  color: string;
  featurePills: MatrixFeaturePill[];
  details: Record<string, string>;
  crmIntegrations: string[];
  compliance: string[];
};

export type ProductMatrixRow = {
  name: string;
  total: number;
  products: string[];
};

export type ProductMatrix = {
  columns: string[];
  rows: ProductMatrixRow[];
};

export type MergedSolutionSupplier = {
  name: string;
  website?: string;
  categories: SolutionCategoryId[];
  features: string[];
  pricing?: string;
  source: 'candid' | 'network';
  description?: string;
  candidRecommended?: boolean;
  capabilities?: string[];
  services?: string[];
  logoUrl?: string;
  ucaas?: MatrixCard;
  ccaas?: MatrixCard;
  productMatrix?: ProductMatrixRow;
  /** Union of admin tags + matrix capabilities/products for filtering. */
  matrixFeatures: string[];
};

export type FindSolutionsSort =
  | 'name-asc'
  | 'name-desc'
  | 'network-first'
  | 'recommended-first'
  | 'products-desc';

export type FindSolutionsViewMode = 'browse' | 'matrix';

const { ucaas, ccaas, productMatrix } = matrixData as {
  ucaas: MatrixCard[];
  ccaas: MatrixCard[];
  productMatrix: ProductMatrix;
};

export const MATRIX_UCAAS = ucaas;
export const MATRIX_CCAAS = ccaas;
export const PRODUCT_MATRIX = productMatrix;

export function normalizeSupplierName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function indexByName<T extends { name: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(normalizeSupplierName(item.name), item);
  return map;
}

const ucaasByName = indexByName(MATRIX_UCAAS);
const ccaasByName = indexByName(MATRIX_CCAAS);
const productByName = indexByName(PRODUCT_MATRIX.rows);

function offeredPillLabels(card?: MatrixCard): string[] {
  if (!card) return [];
  return card.featurePills.filter((p) => p.offered).map((p) => p.label);
}

function mergeCatalogEntry(
  base: CatalogSupplier,
  u?: MatrixCard,
  c?: MatrixCard,
  pm?: ProductMatrixRow,
): MergedSolutionSupplier {
  const capabilities = base.capabilities?.length ? base.capabilities : [];
  const services = base.services?.length ? base.services : [];
  const matrixFeatures = [
    ...new Set([
      ...capabilities,
      ...services,
      ...offeredPillLabels(u),
      ...offeredPillLabels(c),
      ...(pm?.products ?? []),
    ]),
  ];
  const categories = new Set(base.categories);
  if (u) categories.add('ucaas');
  if (c) categories.add('contact_center');
  const features =
    capabilities.length > 0
      ? capabilities
      : base.features.length
        ? base.features
        : [];
  return {
    ...base,
    features,
    capabilities,
    services,
    categories: [...categories],
    ucaas: u,
    ccaas: c,
    productMatrix: pm,
    matrixFeatures,
  };
}

function catalogFromMatrixName(name: string): CatalogSupplier {
  return {
    name,
    categories: [],
    features: [],
    source: 'network',
  };
}

/** All suppliers: portal catalog + curated + matrix-only names. */
export function buildMergedSuppliers(systemSuppliers: CatalogSupplier[]): MergedSolutionSupplier[] {
  const byName = new Map<string, MergedSolutionSupplier>();

  const upsert = (supplier: CatalogSupplier, preferIncoming = false) => {
    const key = normalizeSupplierName(supplier.name);
    const existing = byName.get(key);
    const u = ucaasByName.get(key);
    const c = ccaasByName.get(key);
    const pm = productByName.get(key);
    if (!existing) {
      byName.set(key, mergeCatalogEntry(supplier, u, c, pm));
      return;
    }
    if (!preferIncoming && existing.source === 'candid') return;
    const mergedBase: CatalogSupplier = {
      ...existing,
      ...supplier,
      name: preferIncoming || supplier.source === 'candid' ? supplier.name : existing.name,
      website: supplier.website || existing.website,
      logoUrl: supplier.logoUrl || existing.logoUrl,
      description: supplier.description || existing.description,
      candidRecommended: Boolean(supplier.candidRecommended || existing.candidRecommended),
      capabilities:
        supplier.capabilities?.length ? supplier.capabilities : existing.capabilities,
      services: supplier.services?.length ? supplier.services : existing.services,
      features: supplier.features?.length ? supplier.features : existing.features,
      categories: [...new Set([...existing.categories, ...supplier.categories])],
      source: supplier.source === 'candid' || existing.source === 'candid' ? 'candid' : 'network',
    };
    byName.set(key, mergeCatalogEntry(mergedBase, u, c, pm));
  };

  for (const s of systemSuppliers) upsert(s, true);
  for (const s of CATALOG_SUPPLIERS) upsert(s, false);

  const matrixOnlyNames = new Set<string>();
  for (const card of [...MATRIX_UCAAS, ...MATRIX_CCAAS, ...PRODUCT_MATRIX.rows]) {
    matrixOnlyNames.add(normalizeSupplierName(card.name));
  }
  for (const key of matrixOnlyNames) {
    if (byName.has(key)) continue;
    const name =
      MATRIX_UCAAS.find((c) => normalizeSupplierName(c.name) === key)?.name ??
      MATRIX_CCAAS.find((c) => normalizeSupplierName(c.name) === key)?.name ??
      PRODUCT_MATRIX.rows.find((r) => normalizeSupplierName(r.name) === key)?.name ??
      key;
    upsert(catalogFromMatrixName(name), false);
  }

  return [...byName.values()];
}

export function primaryCategory(s: MergedSolutionSupplier): SolutionCategoryId {
  if (s.categories.length) return s.categories[0];
  if (s.ucaas) return 'ucaas';
  if (s.ccaas) return 'contact_center';
  return 'other';
}

export function allFeatureFilterOptions(suppliers: MergedSolutionSupplier[]): string[] {
  const set = new Set<string>();
  for (const s of suppliers) {
    for (const f of s.matrixFeatures) set.add(f);
    for (const f of s.capabilities ?? []) set.add(f);
    for (const f of s.services ?? []) set.add(f);
  }
  for (const col of PRODUCT_MATRIX.columns) set.add(col);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterSuppliers(
  suppliers: MergedSolutionSupplier[],
  opts: {
    query: string;
    category: SolutionCategoryId | 'all';
    features: string[];
    viewMode: FindSolutionsViewMode;
    networkOnly: boolean;
    recommendedOnly?: boolean;
  },
): MergedSolutionSupplier[] {
  let list = suppliers;

  if (opts.viewMode === 'matrix') list = list.filter((s) => s.productMatrix);

  if (opts.category !== 'all') {
    const cat = opts.category;
    list = list.filter((s) => s.categories.includes(cat));
  }

  if (opts.networkOnly) {
    list = list.filter((s) => s.source === 'candid');
  }

  if (opts.recommendedOnly) {
    list = list.filter((s) => s.candidRecommended);
  }

  if (opts.features.length) {
    list = list.filter((s) => opts.features.every((f) => s.matrixFeatures.includes(f)));
  }

  const q = opts.query.trim().toLowerCase();
  if (q) {
    list = list.filter((s) => {
      const hay = [
        s.name,
        s.description,
        s.features.join(' '),
        s.matrixFeatures.join(' '),
        s.ucaas?.stack,
        s.ccaas?.stack,
        ...(s.ucaas?.crmIntegrations ?? []),
        ...(s.ccaas?.crmIntegrations ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return list;
}

export function sortSuppliers(list: MergedSolutionSupplier[], sort: FindSolutionsSort): MergedSolutionSupplier[] {
  const copy = [...list];
  copy.sort((a, b) => {
    if (sort === 'recommended-first') {
      const d = Number(Boolean(b.candidRecommended)) - Number(Boolean(a.candidRecommended));
      if (d !== 0) return d;
    }
    if (sort === 'network-first') {
      const score = (s: MergedSolutionSupplier) => (s.source === 'candid' ? 0 : 1);
      const d = score(a) - score(b);
      if (d !== 0) return d;
    }
    if (sort === 'products-desc') {
      const d = (b.productMatrix?.total ?? 0) - (a.productMatrix?.total ?? 0);
      if (d !== 0) return d;
    }
    const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return sort === 'name-desc' ? -cmp : cmp;
  });
  return copy;
}

export { SOLUTION_CATEGORIES };
