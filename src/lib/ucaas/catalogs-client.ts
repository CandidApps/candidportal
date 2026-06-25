import type { UcaasCatalog, UcaasCatalogRecord } from '@/lib/ucaas/types';

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

const BASE = '/api/admin/solution-providers/ucaas-catalogs';

export async function fetchUcaasCatalogs(providerId?: string): Promise<UcaasCatalogRecord[]> {
  const params = providerId ? `?providerId=${encodeURIComponent(providerId)}` : '';
  const res = await fetch(`${BASE}${params}`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { catalogs?: UcaasCatalogRecord[] };
  return data.catalogs ?? [];
}

export async function createUcaasCatalog(input: {
  providerId: string;
  name: string;
  catalog: UcaasCatalog;
  isDefault?: boolean;
}): Promise<UcaasCatalogRecord> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { catalog: UcaasCatalogRecord };
  return data.catalog;
}

export async function updateUcaasCatalog(input: {
  catalogId: string;
  name?: string;
  catalog?: UcaasCatalog;
  isDefault?: boolean;
}): Promise<UcaasCatalogRecord> {
  const res = await fetch(BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { catalog: UcaasCatalogRecord };
  return data.catalog;
}

export async function deleteUcaasCatalog(catalogId: string): Promise<void> {
  const res = await fetch(`${BASE}?catalogId=${encodeURIComponent(catalogId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res));
}
