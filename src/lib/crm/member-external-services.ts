export type MemberExternalServiceAsset = {
  id: string;
  name: string;
  vendor: string | null;
  status: string;
  monthlyAmountCents: number | null;
  billStoragePath: string | null;
  contractStoragePath: string | null;
  contractFilename: string | null;
  serviceDescription: string | null;
  expiresAt: string | null;
  memberEmail: string | null;
  createdAt: string;
};

export function memberExternalFilename(path: string | null, fallback: string): string {
  if (!path) return fallback;
  const parts = path.split('/');
  return parts[parts.length - 1] || fallback;
}

export function formatMemberExternalMonthly(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo`;
}

export async function markMemberServiceCandidManaged(params: {
  serviceId: string;
  customerId: string;
}): Promise<void> {
  const res = await fetch('/api/admin/crm/member-external-services', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: params.serviceId,
      customerId: params.customerId,
      op: 'mark_candid_managed',
    }),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
}

