import type { SupplierGuide, SupplierGuideCategory } from '@/lib/supplier-guides-types';

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchSupplierGuides(providerId?: string): Promise<SupplierGuide[]> {
  const params = providerId ? `?providerId=${encodeURIComponent(providerId)}` : '';
  const res = await fetch(`/api/admin/supplier-guides${params}`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { guides?: SupplierGuide[] };
  return data.guides ?? [];
}

export async function saveSupplierGuide(input: {
  providerId: string;
  id?: string;
  title: string;
  content: string;
  category: SupplierGuideCategory;
  visibleInPortal: boolean;
  sortOrder?: number;
}): Promise<SupplierGuide> {
  const res = await fetch('/api/admin/supplier-guides', {
    method: input.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { guide: SupplierGuide };
  return data.guide;
}

export async function deleteSupplierGuide(id: string): Promise<void> {
  const res = await fetch(`/api/admin/supplier-guides?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchPortalSupplierGuides(vendors: string[]): Promise<SupplierGuide[]> {
  const q = vendors.filter(Boolean).join(',');
  if (!q) return [];
  const res = await fetch(`/api/portal/supplier-guides?vendors=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { guides?: SupplierGuide[] };
  return data.guides ?? [];
}

export async function fetchAdminSupplierGuidesContext(): Promise<SupplierGuide[]> {
  return fetchSupplierGuides();
}
