import type { CampaignInput, IncentiveCampaign } from '@/lib/incentive-campaigns';
import type {
  RawSpiffRow,
  SpiffDraft,
  SpiffParseResult,
  SpiffSaveResult,
  SpiffSaveRow,
} from '@/lib/incentive-import/types';

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export async function fetchCampaigns(providerDbId?: number): Promise<IncentiveCampaign[]> {
  const qs = providerDbId ? `?providerDbId=${providerDbId}` : '';
  const res = await fetch(`/api/admin/incentive-campaigns${qs}`, { cache: 'no-store' });
  return (await readJson<{ campaigns: IncentiveCampaign[] }>(res)).campaigns;
}

export async function createCampaign(input: CampaignInput): Promise<IncentiveCampaign> {
  const res = await fetch('/api/admin/incentive-campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return (await readJson<{ campaign: IncentiveCampaign }>(res)).campaign;
}

export async function updateCampaign(
  id: string,
  input: CampaignInput | { action: 'end_early' | 'reopen' },
): Promise<IncentiveCampaign> {
  const res = await fetch(`/api/admin/incentive-campaigns/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return (await readJson<{ campaign: IncentiveCampaign }>(res)).campaign;
}

export async function deleteCampaign(id: string): Promise<void> {
  const res = await fetch(`/api/admin/incentive-campaigns/${id}`, { method: 'DELETE' });
  await readJson<{ ok: true }>(res);
}

export async function uploadCampaignBanner(id: string, file: File): Promise<IncentiveCampaign> {
  const form = new FormData();
  form.set('file', file);
  const res = await fetch(`/api/admin/incentive-campaigns/${id}/banner`, { method: 'POST', body: form });
  return (await readJson<{ campaign: IncentiveCampaign }>(res)).campaign;
}

export async function removeCampaignBanner(id: string): Promise<IncentiveCampaign> {
  const res = await fetch(`/api/admin/incentive-campaigns/${id}/banner`, { method: 'DELETE' });
  return (await readJson<{ campaign: IncentiveCampaign }>(res)).campaign;
}

export async function parseSpiffImport(input: {
  file?: File | null;
  text?: string;
  sheet?: string;
  program?: string;
}): Promise<SpiffParseResult> {
  const form = new FormData();
  if (input.file) form.set('file', input.file);
  if (input.text) form.set('text', input.text);
  if (input.sheet) form.set('sheet', input.sheet);
  if (input.program) form.set('program', input.program);
  const res = await fetch('/api/admin/incentive-campaigns/import/parse', { method: 'POST', body: form });
  return readJson<SpiffParseResult>(res);
}

export async function rewriteSpiffRows(rows: RawSpiffRow[], signal?: AbortSignal): Promise<SpiffDraft[]> {
  const res = await fetch('/api/admin/incentive-campaigns/import/rewrite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
    signal,
  });
  return (await readJson<{ drafts: SpiffDraft[] }>(res)).drafts;
}

export async function saveSpiffImport(rows: SpiffSaveRow[]): Promise<SpiffSaveResult> {
  const res = await fetch('/api/admin/incentive-campaigns/import/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  return readJson<SpiffSaveResult>(res);
}
