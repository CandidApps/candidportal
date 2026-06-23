import type { MerchantAnalysisProvider } from '@/lib/analysis/types';

export async function fetchMerchantAnalysisProviders(): Promise<MerchantAnalysisProvider[]> {
  const res = await fetch('/api/portal/merchant-analysis-providers');
  if (!res.ok) {
    if (res.status === 401) return [];
    try {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? res.statusText);
    } catch (err) {
      if (err instanceof Error && err.message) throw err;
      throw new Error(res.statusText);
    }
  }
  const data = (await res.json()) as { providers?: MerchantAnalysisProvider[] };
  return data.providers ?? [];
}
