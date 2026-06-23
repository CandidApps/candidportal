import type { RateTemplateRecord } from '@/lib/rate-template-types';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchProviderRateTemplates(providerId: string): Promise<RateTemplateRecord[]> {
  const params = new URLSearchParams({ providerId });
  const res = await fetch(`/api/admin/solution-providers/rate-templates?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { templates?: RateTemplateRecord[] };
  return data.templates ?? [];
}

export async function createProviderRateTemplate(params: {
  providerId: string;
  name: string;
  lines?: ScheduleARateLine[];
  isDefault?: boolean;
  importedFromScheduleA?: boolean;
}): Promise<RateTemplateRecord> {
  const res = await fetch('/api/admin/solution-providers/rate-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { template?: RateTemplateRecord };
  if (!data.template) throw new Error('Create failed');
  return data.template;
}

export async function saveProviderRateTemplate(params: {
  templateId: string;
  name?: string;
  lines?: ScheduleARateLine[];
  isDefault?: boolean;
  importedFromScheduleA?: boolean;
}): Promise<RateTemplateRecord> {
  const res = await fetch('/api/admin/solution-providers/rate-templates', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { template?: RateTemplateRecord };
  if (!data.template) throw new Error('Save failed');
  return data.template;
}

export async function deleteProviderRateTemplate(templateId: string): Promise<void> {
  const params = new URLSearchParams({ templateId });
  const res = await fetch(`/api/admin/solution-providers/rate-templates?${params.toString()}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res));
}
