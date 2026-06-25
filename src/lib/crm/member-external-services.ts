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
