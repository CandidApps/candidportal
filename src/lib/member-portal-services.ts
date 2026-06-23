import { getCrmRuntimeData } from '@/lib/crm/runtime-store';
import {
  allDealsForCustomerContracts,
  buildContractsFromDeals,
  contractServiceTitle,
  dedupeCustomerContractMap,
  dedupeCustomerContracts,
  mergeContractMaps,
} from '@/lib/customer-contracts-from-deals';
import { applyContractOverridesMap } from '@/lib/customer-contract-overrides';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import { buildPortalImportContracts, buildPortalImportDocuments } from '@/lib/portal-import/merge';
import { documentViewUrl, findDocumentForContract } from '@/lib/contract-document-link';
import type { Customer, Location } from '@/components/CustomersView';
import {
  logoKeyFromLabel,
  type ServiceCardModel,
} from '@/lib/services/account-services';
import { resolveSupplierLogo } from '@/lib/supplier-logos';
import type { PortalNonCandidService } from '@/lib/portal-import/merge';

const LOGO_INITIALS: Record<string, string> = {
  ringcentral: 'RC',
  comcast: 'CB',
  square: 'SQ',
  microsoft: 'MS',
  msp: 'SV',
  external: 'EX',
};

const MANAGED_DEAL_STATUSES = new Set<CandidContractRecord['dealStatus']>([
  'active',
  'expiring',
  'expired',
  'pending',
]);

let contractsCache: Record<string, CandidContractRecord[]> | null = null;
let contractsCacheKey = '';

function runtimeContractsCacheKey(): string {
  const runtime = getCrmRuntimeData();
  const customerIds = Object.keys(runtime.contractsByCustomerId).sort().join(',');
  return `${runtime.source}:${customerIds}`;
}

function getAllCustomerContracts(): Record<string, CandidContractRecord[]> {
  const cacheKey = runtimeContractsCacheKey();
  if (contractsCache && contractsCacheKey === cacheKey) {
    return contractsCache;
  }

  const runtime = getCrmRuntimeData();
  const hasRuntimeContracts = Object.keys(runtime.contractsByCustomerId).length > 0;

  if (hasRuntimeContracts) {
    contractsCache = applyContractOverridesMap(
      dedupeCustomerContractMap(runtime.contractsByCustomerId),
    );
    contractsCacheKey = cacheKey;
    return contractsCache;
  }

  const customers = runtime.customers;
  contractsCache = applyContractOverridesMap(
    dedupeCustomerContractMap(
      mergeContractMaps(
        buildContractsFromDeals(customers, allDealsForCustomerContracts()),
        buildPortalImportContracts(customers),
      ),
    ),
  );
  contractsCacheKey = cacheKey;
  return contractsCache;
}

/** Clear cached contracts after admin edits or CRM hydration for a different customer. */
export function invalidateMemberPortalContractsCache(): void {
  contractsCache = null;
  contractsCacheKey = '';
}

if (typeof window !== 'undefined') {
  window.addEventListener('candid-contract-updated', invalidateMemberPortalContractsCache);
}

function filterByLocations(
  contracts: CandidContractRecord[],
  locationIds: string[],
): CandidContractRecord[] {
  if (!locationIds.length) return contracts;
  return contracts.filter((c) => {
    const loc = c.locationId || c.physicalLocationId || c.billingLocationId;
    return !loc || locationIds.includes(loc);
  });
}

function findCustomer(customerId: string): Customer | undefined {
  return getCrmRuntimeData().customers.find((c) => c.id === customerId);
}

function locationForContract(
  customer: Customer | undefined,
  contract: CandidContractRecord,
): { label: string; address: string } {
  const locId = contract.locationId || contract.physicalLocationId || contract.billingLocationId;
  const loc = customer?.locations.find((l) => l.id === locId);
  if (!loc) return { label: '', address: '' };
  return { label: loc.label, address: formatLocationAddress(loc) };
}

function formatLocationAddress(loc: Location): string {
  const cityState = [loc.city, loc.state].filter(Boolean).join(', ');
  return [loc.street, cityState, loc.zip].filter(Boolean).join(' · ');
}

function contractToServiceCard(
  contract: CandidContractRecord,
  customer: Customer | undefined,
  documents: CustomerDocument[],
): ServiceCardModel {
  const title = contractServiceTitle(contract);
  const logoInfo = resolveSupplierLogo(
    contract.solution ?? contract.vendor,
    contract.product ?? contract.service,
  );
  const logo = logoInfo.key !== 'msp' ? logoInfo.key : logoKeyFromLabel(
    `${contract.solution ?? ''} ${contract.product ?? ''} ${contract.service ?? ''}`,
  );
  const mrc = contract.mrc ?? contract.monthly ?? 0;

  let status: 'active' | 'expiring' = 'active';
  let exp = '';
  let expTxt = '';
  let expSub = '';

  const endIso = contract.contractEndDate;
  if (endIso) {
    const end = new Date(endIso);
    if (!Number.isNaN(end.getTime())) {
      const days = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      expTxt = `Expires ${end.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
      if (days <= 0) {
        status = 'expiring';
        exp = 'urgent';
        expSub = 'Renewal needed';
      } else if (days <= 60) {
        status = 'expiring';
        exp = 'urgent';
        expSub = `${days} days remaining`;
      } else if (days <= 180) {
        status = 'expiring';
        exp = 'warn';
        expSub = `${days} days remaining`;
      }
    }
  } else if (contract.dealStatus === 'expired' || contract.dealStatus === 'expiring') {
    status = 'expiring';
    exp = contract.dealStatus === 'expired' ? 'urgent' : 'warn';
    expTxt = contract.expires && contract.expires !== '—' ? contract.expires : 'Renewal review';
  }

  const filter: string[] = ['candid'];
  if (status === 'expiring') filter.push('expiring');

  const name = title.includes(' — ') ? title.split(' — ')[0]! : title;
  const vendor =
    contract.solutionDescription?.trim() ||
    (title.includes(' — ') ? title : contract.vendor || title);

  const { label: locationLabel, address: locationAddress } = locationForContract(customer, contract);
  const relatedDoc = findDocumentForContract(contract, documents);
  const documentUrl = relatedDoc ? documentViewUrl(relatedDoc) : null;

  return {
    id: `portal-ct-${contract.id}`,
    cls: 'candid-svc',
    logo,
    logoTxt: logoInfo.initials || LOGO_INITIALS[logo] || 'SV',
    name,
    vendor,
    status,
    statusTxt: status === 'expiring' ? 'Expiring Soon' : 'Active',
    badge: 'candid',
    candidManaged: true,
    pending: false,
    amount:
      mrc > 0
        ? `$${mrc.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
        : undefined,
    exp,
    expTxt: expTxt || (status === 'active' ? 'Active contract' : ''),
    expSub,
    filter,
    locationLabel: locationLabel || undefined,
    locationAddress: locationAddress || undefined,
    contractId: contract.id,
    documentUrl,
    documentFilename: relatedDoc?.filename,
    contractStartDate: contract.contractStartDate,
    contractEndDate: contract.contractEndDate,
  };
}

/** Candid-managed services from admin portal contracts for a logged-in customer. */
export function buildPortalCandidServices(
  customerId: string,
  locationIds: string[] = [],
): ServiceCardModel[] {
  const all = getAllCustomerContracts()[customerId] ?? [];
  const managed = dedupeCustomerContracts(filterByLocations(all, locationIds)).filter((c) =>
    MANAGED_DEAL_STATUSES.has(c.dealStatus),
  );
  const customer = findCustomer(customerId);
  const runtimeDocs = getCrmRuntimeData().documentsByCustomerId;
  const documents =
    runtimeDocs[customerId] ?? buildPortalImportDocuments(getCrmRuntimeData().customers)[customerId] ?? [];
  return managed.map((c) => contractToServiceCard(c, customer, documents));
}

function portalNonCandidToServiceCard(
  item: PortalNonCandidService,
  customerId: string,
  index: number,
): ServiceCardModel {
  const logoInfo = resolveSupplierLogo(item.provider, item.product);
  const logo = logoInfo.key !== 'msp' ? logoInfo.key : logoKeyFromLabel(`${item.provider} ${item.product}`);
  const mrc = item.mrc ?? 0;

  return {
    id: `portal-nc-${customerId}-${index}`,
    cls: 'external-svc',
    logo,
    logoTxt: logoInfo.initials || LOGO_INITIALS[logo] || 'EX',
    name: item.product?.trim() || item.provider,
    vendor: [item.provider, item.accountNum ? `Acct ${item.accountNum}` : ''].filter(Boolean).join(' — '),
    status: 'external',
    statusTxt: 'External',
    badge: 'external',
    candidManaged: false,
    pending: false,
    amount: mrc > 0 ? `$${mrc.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : undefined,
    filter: ['external'],
  };
}

/** Imported non-Candid services from portal master data for one customer account. */
export function buildPortalNonCandidServices(customerId: string): ServiceCardModel[] {
  const customer = findCustomer(customerId);
  const items = customer?.portal?.nonCandidServices ?? [];
  return items.map((item, index) => portalNonCandidToServiceCard(item, customerId, index));
}

function servicesOverlap(a: ServiceCardModel, b: ServiceCardModel): boolean {
  if (a.id === b.id) return true;
  // Each bill submission / analysis review is its own card.
  if (a.analysisReviewId || b.analysisReviewId) return false;
  // Keep distinct bills pending review even when the vendor label matches.
  if (a.pending || b.pending) return false;
  const aKey = `${a.name}|${a.vendor}`.toLowerCase();
  const bKey = `${b.name}|${b.vendor}`.toLowerCase();
  return aKey === bKey;
}

export type BuildMemberServicesInput = {
  userId?: string;
  userServices: ServiceCardModel[];
  portalCustomerId?: string | null;
  locationIds?: string[];
  demoServices: ServiceCardModel[];
  /** Admin portal preview — hide the previewing admin's personal uploads from customer view */
  portalPreviewActive?: boolean;
};

/** Merge portal contracts with per-user uploaded services for member views. */
export function buildMemberServicesList({
  userId,
  userServices,
  portalCustomerId,
  locationIds = [],
  demoServices,
  portalPreviewActive = false,
}: BuildMemberServicesInput): ServiceCardModel[] {
  const portalCandid = portalCustomerId
    ? buildPortalCandidServices(portalCustomerId, locationIds)
    : [];
  const portalExternal = portalCustomerId ? buildPortalNonCandidServices(portalCustomerId) : [];

  if (!userId && !portalCustomerId) {
    return demoServices;
  }

  const includeAllUserUploads = Boolean(userId) && !portalPreviewActive;
  /** During admin preview, still surface external bills submitted in this session. */
  const includePreviewUploads = Boolean(userId) && portalPreviewActive;

  const accountExternal = userServices.filter((s) => {
    if (s.candidManaged) return false;
    if (s.savingsOpportunityOnly) return false;
    if (includeAllUserUploads) return true;
    // Preview mode: show customer bill uploads (pending and published analyses).
    if (includePreviewUploads) return !s.savingsOpportunityOnly;
    return false;
  });
  const accountCandid = includeAllUserUploads ? userServices.filter((s) => s.candidManaged) : [];

  const candid: ServiceCardModel[] = [...portalCandid];
  for (const svc of accountCandid) {
    if (!candid.some((p) => servicesOverlap(p, svc))) {
      candid.push(svc);
    }
  }

  const external: ServiceCardModel[] = [...portalExternal];
  for (const svc of accountExternal) {
    if (!external.some((p) => servicesOverlap(p, svc))) {
      external.push(svc);
    }
  }

  return [...candid, ...external];
}

/** Member-uploaded bills tracked on My Savings Opportunities (not My Services until added). */
export function buildSavingsOpportunityList(userServices: ServiceCardModel[]): ServiceCardModel[] {
  return userServices.filter((s) => !s.candidManaged && s.savingsOpportunityOnly);
}
