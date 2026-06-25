import type { SupplierSource } from '@/lib/supplier-sources-types';

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchSupplierSources(
  providerId?: string,
): Promise<{ sources: SupplierSource[]; types: string[] }> {
  const params = providerId ? `?providerId=${encodeURIComponent(providerId)}` : '';
  const res = await fetch(`/api/admin/supplier-sources${params}`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { sources?: SupplierSource[]; types?: string[] };
  return { sources: data.sources ?? [], types: data.types ?? [] };
}

export async function saveSupplierSource(input: {
  providerId: string;
  id?: string;
  title: string;
  url: string;
  sourceType: string;
  visibleInPortal: boolean;
  sortOrder?: number;
}): Promise<SupplierSource> {
  const res = await fetch('/api/admin/supplier-sources', {
    method: input.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { source: SupplierSource };
  return data.source;
}

export async function deleteSupplierSource(id: string): Promise<void> {
  const res = await fetch(`/api/admin/supplier-sources?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchPortalSupplierSources(vendors: string[]): Promise<SupplierSource[]> {
  const q = vendors.filter(Boolean).join(',');
  if (!q) return [];
  const res = await fetch(`/api/portal/supplier-sources?vendors=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { sources?: SupplierSource[] };
  return data.sources ?? [];
}

export async function fetchAdminSupplierSourcesContext(): Promise<SupplierSource[]> {
  const { sources } = await fetchSupplierSources();
  return sources;
}
