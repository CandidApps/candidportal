import type { CandidContractRecord } from '@/lib/customer-records';

type CustomerStatus = 'active' | 'prospect' | 'inactive';

export type AccountCustomer = {
  id: string;
  company: string;
  status: CustomerStatus;
  agent: string;
  since: string;
  spend: number;
};

export type AccountListTab = 'active_recurring' | 'non_recurring' | 'inactive' | 'expiring_contracts';
export type AccountsViewBy = 'customer' | 'commission_partner' | 'supplier_vendor' | 'agents';
export type AccountSortKey = 'company' | 'agent' | 'spend' | 'serviceStart';
export type SortDir = 'asc' | 'desc';

export const ACCOUNT_LIST_TABS: { id: AccountListTab; label: string }[] = [
  { id: 'active_recurring', label: 'Active Recurring' },
  { id: 'non_recurring', label: 'Non Recurring' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'expiring_contracts', label: 'Expiring Contracts' },
];

export const EXPIRING_WINDOW_DAYS = 90;

export const ACCOUNTS_VIEW_BY: { id: AccountsViewBy; label: string }[] = [
  { id: 'customer', label: 'Customer' },
  { id: 'commission_partner', label: 'Commission Partner' },
  { id: 'supplier_vendor', label: 'Supplier & Vendor' },
  { id: 'agents', label: 'Agents' },
];

export function accountListTabForCustomer(c: { status: CustomerStatus }): AccountListTab {
  if (c.status === 'inactive') return 'inactive';
  if (c.status === 'prospect') return 'non_recurring';
  return 'active_recurring';
}

export function accountStatusLabel(c: { status: CustomerStatus }): string {
  const tab = accountListTabForCustomer(c);
  if (tab === 'active_recurring') return 'Active Recurring';
  if (tab === 'non_recurring') return 'Non Recurring';
  return 'Inactive';
}

function daysUntilDate(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function contractIsExpiringSoon(
  contract: CandidContractRecord,
  windowDays = EXPIRING_WINDOW_DAYS,
): boolean {
  if (contract.dealStatus === 'expiring') return true;
  if (contract.contractEndDate) {
    const days = daysUntilDate(contract.contractEndDate);
    if (days != null && days >= 0 && days <= windowDays) return true;
  }
  return false;
}

type ExpiringCustomerRef = {
  id: string;
  portal?: {
    renewalAlerts?: Array<{ daysUntilRenewal?: number; renewalDate?: string }>;
  };
};

export function customerHasExpiringContracts(
  customer: ExpiringCustomerRef,
  contracts: CandidContractRecord[],
  windowDays = EXPIRING_WINDOW_DAYS,
): boolean {
  if (contracts.some((c) => contractIsExpiringSoon(c, windowDays))) return true;
  for (const alert of customer.portal?.renewalAlerts ?? []) {
    if (
      typeof alert.daysUntilRenewal === 'number' &&
      alert.daysUntilRenewal >= 0 &&
      alert.daysUntilRenewal <= windowDays
    ) {
      return true;
    }
    if (alert.renewalDate) {
      const days = daysUntilDate(alert.renewalDate);
      if (days != null && days >= 0 && days <= windowDays) return true;
    }
  }
  return false;
}

export function filterCustomersForAccountTab<T extends AccountCustomer & ExpiringCustomerRef>(
  customers: T[],
  tab: AccountListTab,
  contractsByCustomer: Record<string, CandidContractRecord[]>,
): T[] {
  if (tab === 'expiring_contracts') {
    return customers.filter((c) =>
      customerHasExpiringContracts(c, contractsByCustomer[c.id] ?? []),
    );
  }
  return customers.filter((c) => accountListTabForCustomer(c) === tab);
}

function parseLooseDate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || /import/i.test(trimmed)) return null;
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  const m = trimmed.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const parsed = new Date(`${m[1]} 1, ${m[2]}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }
  return null;
}

export function serviceStartForCustomer(
  customer: Pick<AccountCustomer, 'since'>,
  contracts: CandidContractRecord[],
): { display: string; sortKey: number } {
  const isoDates: string[] = [];
  for (const c of contracts) {
    if (c.contractStartDate) isoDates.push(c.contractStartDate);
    if (c.contractSignDate) isoDates.push(c.contractSignDate);
  }
  if (isoDates.length) {
    const earliest = [...isoDates].sort()[0]!;
    const d = new Date(earliest);
    const display = Number.isNaN(d.getTime())
      ? earliest
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return { display, sortKey: d.getTime() || 0 };
  }
  const loose = parseLooseDate(customer.since);
  return { display: customer.since || '—', sortKey: loose ?? 0 };
}

export function sortCustomers<T extends AccountCustomer>(
  list: T[],
  sortKey: AccountSortKey,
  sortDir: SortDir,
  contractsByCustomer: Record<string, CandidContractRecord[]>,
): T[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'company':
        cmp = a.company.localeCompare(b.company);
        break;
      case 'agent':
        cmp = a.agent.localeCompare(b.agent);
        break;
      case 'spend':
        cmp = a.spend - b.spend;
        break;
      case 'serviceStart':
        cmp =
          serviceStartForCustomer(a, contractsByCustomer[a.id] ?? []).sortKey -
          serviceStartForCustomer(b, contractsByCustomer[b.id] ?? []).sortKey;
        break;
      default:
        cmp = 0;
    }
    if (cmp === 0) cmp = a.company.localeCompare(b.company);
    return cmp * dir;
  });
}
