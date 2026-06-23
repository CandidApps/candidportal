import type { ScheduleARateLine, ScheduleARecord } from '@/lib/schedule-a-types';

const PARSE_TIMEOUT_MS = 120_000;
const MAX_SCHEDULE_A_BYTES = 12 * 1024 * 1024;

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchProviderScheduleA(providerId: string): Promise<ScheduleARecord | null> {
  const params = new URLSearchParams({ providerId });
  const res = await fetch(`/api/admin/solution-providers/schedule-a?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { scheduleA?: ScheduleARecord | null };
  return data.scheduleA ?? null;
}

export async function parseScheduleAFromFile(file: File): Promise<{
  lines: ScheduleARateLine[];
  summary?: string;
}> {
  if (file.size > MAX_SCHEDULE_A_BYTES) {
    throw new Error('File is too large. Please upload a Schedule A PDF under 12 MB.');
  }

  const form = new FormData();
  form.set('file', file);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

  try {
    const res = await fetch('/api/admin/parse-schedule-a', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(await parseError(res));
    return (await res.json()) as { lines: ScheduleARateLine[]; summary?: string };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Parsing timed out after 2 minutes. Try a smaller PDF or add rates manually.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function saveProviderScheduleA(params: {
  providerId: string;
  lines: ScheduleARateLine[];
  file?: File | null;
}): Promise<ScheduleARecord> {
  if (params.file) {
    const form = new FormData();
    form.set('providerId', params.providerId);
    form.set('lines', JSON.stringify(params.lines));
    form.set('file', params.file);
    const res = await fetch('/api/admin/solution-providers/schedule-a', { method: 'PUT', body: form });
    if (!res.ok) throw new Error(await parseError(res));
    const data = (await res.json()) as { scheduleA?: ScheduleARecord };
    if (!data.scheduleA) throw new Error('Save failed');
    return data.scheduleA;
  }

  const res = await fetch('/api/admin/solution-providers/schedule-a', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: params.providerId, lines: params.lines }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { scheduleA?: ScheduleARecord };
  if (!data.scheduleA) throw new Error('Save failed');
  return data.scheduleA;
}

export function scheduleADocumentUrl(storagePath?: string, documentId?: string): string | null {
  if (documentId) {
    return `/api/admin/registry-documents?documentId=${encodeURIComponent(documentId)}`;
  }
  return null;
}
