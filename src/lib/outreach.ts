export const OUTREACH_STATUSES = [
  'not_contacted',
  'contacted',
  'no_response',
  'interested',
  'closed',
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_STATUS_LABELS: Record<OutreachStatus, string> = {
  not_contacted: 'Not contacted',
  contacted: 'Contacted',
  no_response: 'No response',
  interested: 'Interested',
  closed: 'Closed',
};

export type OutreachAccount = {
  id: string;
  ownerUserId: string;
  ownerEmail?: string;
  ownerDisplayName?: string;
  customerExternalId: string;
  company: string;
  status: OutreachStatus;
  knowsCandid: boolean | null;
  knowsWhatWeDo: boolean | null;
  howElseHelp: string;
  notes: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type OutreachOwnerOption = {
  id: string;
  email: string;
  displayName: string;
};

function isOutreachStatus(value: string): value is OutreachStatus {
  return (OUTREACH_STATUSES as readonly string[]).includes(value);
}

export function normalizeOutreachStatus(value: unknown): OutreachStatus {
  if (typeof value === 'string' && isOutreachStatus(value)) return value;
  return 'not_contacted';
}

export async function listOutreachAccounts(owner: 'me' | 'all' | string = 'me'): Promise<{
  items: OutreachAccount[];
  owners: OutreachOwnerOption[];
  currentUserId: string | null;
}> {
  const params = new URLSearchParams({ owner });
  const res = await fetch(`/api/admin/outreach?${params.toString()}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to load outreach');
  }
  return (await res.json()) as {
    items: OutreachAccount[];
    owners: OutreachOwnerOption[];
    currentUserId: string | null;
  };
}

export async function addOutreachAccounts(customerExternalIds: string[]): Promise<OutreachAccount[]> {
  const res = await fetch('/api/admin/outreach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerExternalIds }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to add accounts');
  }
  const data = (await res.json()) as { items?: OutreachAccount[] };
  return data.items ?? [];
}

export async function patchOutreachAccount(
  id: string,
  patch: Partial<{
    status: OutreachStatus;
    knowsCandid: boolean | null;
    knowsWhatWeDo: boolean | null;
    howElseHelp: string;
    notes: string;
    sortOrder: number;
  }>,
): Promise<OutreachAccount> {
  const res = await fetch('/api/admin/outreach', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to update');
  }
  const data = (await res.json()) as { item?: OutreachAccount };
  if (!data.item) throw new Error('Update failed');
  return data.item;
}

export async function deleteOutreachAccount(id: string): Promise<void> {
  const params = new URLSearchParams({ id });
  const res = await fetch(`/api/admin/outreach?${params.toString()}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to remove');
  }
}
