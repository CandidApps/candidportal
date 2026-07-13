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
  CANDID_RENEWAL_WINDOW_DAYS,
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
  const mrc = Number(contract.mrc ?? contract.monthly ?? 0);

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
      } else if (days <= CANDID_RENEWAL_WINDOW_DAYS) {
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
      Number.isFinite(mrc) && mrc > 0
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

function normalizeServiceToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function primaryVendorToken(svc: ServiceCardModel): string {
  const raw = `${svc.name} ${svc.vendor}`.trim();
  return normalizeServiceToken(raw).split(/\s+/)[0] ?? '';
}

function servicesOverlap(a: ServiceCardModel, b: ServiceCardModel): boolean {
  if (a.id === b.id) return true;
  // Keep distinct bills pending review even when the vendor label matches.
  if (a.pending || b.pending) return false;
  // Distinct bill analyses shouldn't collapse into each other.
  if (
    a.analysisReviewId &&
    b.analysisReviewId &&
    a.analysisReviewId !== b.analysisReviewId
  ) {
    return false;
  }
  const aKey = `${a.name}|${a.vendor}`.toLowerCase();
  const bKey = `${b.name}|${b.vendor}`.toLowerCase();
  if (aKey === bKey) return true;
  // Converted pipeline deals often title as "Vonage — Vonage" while the account
  // service is just "Vonage" — treat shared primary vendor as an overlap.
  const aVendor = primaryVendorToken(a);
  const bVendor = primaryVendorToken(b);
  return Boolean(aVendor && bVendor && aVendor === bVendor);
}

function enrichServiceAmount(
  target: ServiceCardModel,
  source: ServiceCardModel,
): ServiceCardModel {
  if (target.amount || !source.amount) {
    return {
      ...target,
      savingsBaseline: target.savingsBaseline ?? source.savingsBaseline ?? null,
      analysisSnapshot: target.analysisSnapshot ?? source.analysisSnapshot ?? null,
      analysisReviewId: target.analysisReviewId ?? source.analysisReviewId,
    };
  }
  return {
    ...target,
    amount: source.amount,
    savingsBaseline: target.savingsBaseline ?? source.savingsBaseline ?? null,
    analysisSnapshot: target.analysisSnapshot ?? source.analysisSnapshot ?? null,
    analysisReviewId: target.analysisReviewId ?? source.analysisReviewId,
  };
}

function candidServiceScore(svc: ServiceCardModel): number {
  return (
    (svc.amount ? 10 : 0) +
    (svc.contractEndDate ? 5 : 0) +
    (svc.savingsBaseline ? 2 : 0) +
    (svc.analysisReviewId ? 1 : 0) +
    (svc.contractId?.startsWith('contract-pipeline-') ? 3 : 0)
  );
}

/** Collapse same-vendor managed cards (legacy BMW $0 + new converted deal). */
function dedupeOverlappingServices(list: ServiceCardModel[]): ServiceCardModel[] {
  const out: ServiceCardModel[] = [];
  for (const svc of list) {
    const idx = out.findIndex((existing) => servicesOverlap(existing, svc));
    if (idx < 0) {
      out.push(svc);
      continue;
    }
    const existing = out[idx]!;
    const winner =
      candidServiceScore(svc) > candidServiceScore(existing)
        ? enrichServiceAmount(svc, existing)
        : enrichServiceAmount(existing, svc);
    out[idx] = winner;
  }
  return out;
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
  /** During admin preview, only surface uploads explicitly tagged to this customer. */
  const includePreviewUploads = Boolean(userId) && portalPreviewActive;

  const matchesPortalCustomer = (svc: ServiceCardModel) =>
    Boolean(portalCustomerId) && svc.crmCustomerId === portalCustomerId;

  const accountExternal = userServices.filter((s) => {
    if (s.candidManaged) return false;
    if (s.savingsOpportunityOnly) return false;
    if (includeAllUserUploads) return true;
    if (includePreviewUploads) return matchesPortalCustomer(s);
    return false;
  });
  const accountCandid = userServices.filter((s) => {
    if (!s.candidManaged) return false;
    if (includeAllUserUploads) return true;
    // Admin login-as: include candid-managed account services for this customer so
    // converted monthly pricing shows on My Services even before CRM refresh.
    if (includePreviewUploads) return matchesPortalCustomer(s);
    return false;
  });

  const candid: ServiceCardModel[] = dedupeOverlappingServices(
    portalCandid.map((portalSvc) => {
      const match = accountCandid.find((svc) => servicesOverlap(portalSvc, svc));
      return match ? enrichServiceAmount(portalSvc, match) : portalSvc;
    }),
  );
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

/** Limit member uploads/quotes/requests to the scoped CRM customer portal. */
export function userServicesForPortalScope(
  services: ServiceCardModel[],
  portalCustomerId?: string | null,
): ServiceCardModel[] {
  if (!portalCustomerId) return services;
  return services.filter((s) => s.crmCustomerId === portalCustomerId);
}

/** Member-uploaded bills tracked on My Savings Opportunities (not My Services until added). */
export function buildSavingsOpportunityList(userServices: ServiceCardModel[]): ServiceCardModel[] {
  return userServices.filter((s) => !s.candidManaged && s.savingsOpportunityOnly);
}
