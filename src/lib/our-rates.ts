import type { OurRateRecord } from '@/lib/our-rate-types';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchProviderOurRates(providerId: string): Promise<OurRateRecord | null> {
  const params = new URLSearchParams({ providerId });
  const res = await fetch(`/api/admin/solution-providers/our-rates?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { ourRates?: OurRateRecord | null };
  return data.ourRates ?? null;
}

export async function saveProviderOurRates(params: {
  providerId: string;
  lines: ScheduleARateLine[];
  importedFromScheduleA?: boolean;
}): Promise<OurRateRecord> {
  const res = await fetch('/api/admin/solution-providers/our-rates', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { ourRates?: OurRateRecord };
  if (!data.ourRates) throw new Error('Save failed');
  return data.ourRates;
}
