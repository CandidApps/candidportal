import type { CandidContractRecord } from '@/lib/customer-records';
import { contractServiceTypeLabel } from '@/lib/crm/contract-service-pricing';

type CustomerStatus = 'active' | 'prospect' | 'inactive';

export type AccountCustomer = {
  id: string;
  company: string;
  status: CustomerStatus;
  agent: string;
  since: string;
  spend: number;
  archivedAt?: string | null;
};

export type AccountListTab = 'active_recurring' | 'non_recurring' | 'inactive' | 'expiring_contracts' | 'archived';
export type AccountsViewBy = 'customer' | 'commission_partner' | 'supplier_vendor' | 'agents';
export type AccountSortKey = 'company' | 'agent' | 'spend' | 'serviceStart' | 'commission';
export type SortDir = 'asc' | 'desc';

export const ACCOUNT_LIST_TABS: { id: AccountListTab; label: string }[] = [
  { id: 'active_recurring', label: 'Active Recurring' },
  { id: 'non_recurring', label: 'Non Recurring' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'expiring_contracts', label: 'Expiring Contracts' },
  { id: 'archived', label: 'Archived' },
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
  if (tab === 'archived') {
    return customers.filter((c) => Boolean(c.archivedAt));
  }

  const active = customers.filter((c) => !c.archivedAt);

  if (tab === 'expiring_contracts') {
    return active.filter((c) =>
      customerHasExpiringContracts(c, contractsByCustomer[c.id] ?? []),
    );
  }
  return active.filter((c) => accountListTabForCustomer(c) === tab);
}

export function contractCountsAsActiveService(contract: CandidContractRecord): boolean {
  if (contract.isCandid === false) return false;
  return (
    contract.dealStatus !== 'expired' &&
    contract.dealStatus !== 'cancelled' &&
    contract.dealStatus !== 'draft'
  );
}

function normalizeServiceLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim();
}

/** Split comma-separated contract service strings (e.g. "Business Cable, SD-WAN"). */
export function splitContractServiceLabel(raw: string): string[] {
  return raw
    .split(/\s*,\s*/)
    .map((part) => normalizeServiceLabel(part))
    .filter(Boolean);
}

function addServiceLabels(target: Set<string>, raw: string | null | undefined): void {
  if (!raw?.trim()) return;
  for (const part of splitContractServiceLabel(raw)) {
    target.add(part);
  }
}

function labelsFromProviderLike(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  const sep = ' — ';
  const idx = trimmed.indexOf(sep);
  if (idx < 0) return [];
  return splitContractServiceLabel(trimmed.slice(idx + sep.length));
}

/** Service labels on a single contract (split lists, pricing rows, provider suffix). */
export function contractServiceLabels(contract: CandidContractRecord): string[] {
  const labels = new Set<string>();
  addServiceLabels(labels, contract.service);
  addServiceLabels(labels, contract.product);
  addServiceLabels(labels, contract.solutionDescription);

  for (const item of contract.pricingLineItems ?? []) {
    addServiceLabels(labels, item.service);
  }

  if (!labels.size) {
    for (const part of labelsFromProviderLike(contract.vendor)) labels.add(part);
    for (const part of labelsFromProviderLike(contract.solution)) labels.add(part);
  }

  if (!labels.size && contract.serviceTypeId) {
    const fallback = contractServiceTypeLabel(contract.serviceTypeId);
    if (fallback) labels.add(fallback);
  }

  return [...labels].sort((a, b) => a.localeCompare(b));
}

/** Active Candid contract services for an account, deduped case-insensitively. */
export function serviceLabelsForCustomer(contracts: CandidContractRecord[]): string[] {
  const ordered = new Map<string, string>();
  for (const contract of contracts) {
    if (!contractCountsAsActiveService(contract)) continue;
    for (const label of contractServiceLabels(contract)) {
      const key = label.toLowerCase();
      if (!ordered.has(key)) ordered.set(key, label);
    }
  }
  return [...ordered.values()].sort((a, b) => a.localeCompare(b));
}

/** Distinct contract service labels across accounts, most common first. */
export function distinctContractServiceOptions(
  contractsByCustomer: Record<string, CandidContractRecord[]>,
): string[] {
  const counts = new Map<string, { label: string; accounts: number }>();
  for (const contracts of Object.values(contractsByCustomer)) {
    for (const label of serviceLabelsForCustomer(contracts)) {
      const key = label.toLowerCase();
      const row = counts.get(key);
      if (row) row.accounts += 1;
      else counts.set(key, { label, accounts: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.accounts - a.accounts || a.label.localeCompare(b.label))
    .map((row) => row.label);
}

/** Empty selection = all services. Otherwise match accounts with any selected label. */
export function customerMatchesServiceFilter(
  contracts: CandidContractRecord[],
  selected: ReadonlySet<string>,
): boolean {
  if (!selected.size) return true;
  const customerLabels = new Set(
    serviceLabelsForCustomer(contracts).map((label) => label.toLowerCase()),
  );
  for (const label of selected) {
    if (customerLabels.has(label.toLowerCase())) return true;
  }
  return false;
}

export function filterCustomersForAccountsList<T extends AccountCustomer & ExpiringCustomerRef>(
  customers: T[],
  tab: AccountListTab,
  contractsByCustomer: Record<string, CandidContractRecord[]>,
  serviceFilters: ReadonlySet<string> = new Set(),
): T[] {
  const tabbed = filterCustomersForAccountTab(customers, tab, contractsByCustomer);
  if (!serviceFilters.size) return tabbed;
  return tabbed.filter((c) =>
    customerMatchesServiceFilter(contractsByCustomer[c.id] ?? [], serviceFilters),
  );
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
  commissionByCustomer: Record<string, number> = {},
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
      case 'commission':
        cmp = (commissionByCustomer[a.id] ?? 0) - (commissionByCustomer[b.id] ?? 0);
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
