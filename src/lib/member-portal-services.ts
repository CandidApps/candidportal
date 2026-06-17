import { PORTAL_ENRICHED_CUSTOMERS } from '@/components/CustomersView';
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

function getAllCustomerContracts(): Record<string, CandidContractRecord[]> {
  if (contractsCache) return contractsCache;
  contractsCache = applyContractOverridesMap(
    dedupeCustomerContractMap(
      mergeContractMaps(
        buildContractsFromDeals(PORTAL_ENRICHED_CUSTOMERS, allDealsForCustomerContracts()),
        buildPortalImportContracts(PORTAL_ENRICHED_CUSTOMERS),
      ),
    ),
  );
  return contractsCache;
}

/** Clear cached contracts after admin edits (localStorage overrides). */
export function invalidateMemberPortalContractsCache(): void {
  contractsCache = null;
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
  return PORTAL_ENRICHED_CUSTOMERS.find((c) => c.id === customerId);
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
  const logo = logoKeyFromLabel(
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
    logoTxt: LOGO_INITIALS[logo] ?? 'SV',
    name,
    vendor,
    status,
    statusTxt: status === 'expiring' ? 'Expiring Soon' : 'Active',
    badge: 'candid',
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
  const documents = buildPortalImportDocuments(PORTAL_ENRICHED_CUSTOMERS)[customerId] ?? [];
  return managed.map((c) => contractToServiceCard(c, customer, documents));
}

function servicesOverlap(a: ServiceCardModel, b: ServiceCardModel): boolean {
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
};

/** Merge portal contracts with per-user uploaded services for member views. */
export function buildMemberServicesList({
  userId,
  userServices,
  portalCustomerId,
  locationIds = [],
  demoServices,
}: BuildMemberServicesInput): ServiceCardModel[] {
  const portalCandid = portalCustomerId
    ? buildPortalCandidServices(portalCustomerId, locationIds)
    : [];

  if (!userId && !portalCustomerId) {
    return demoServices;
  }

  const accountExternal = userServices.filter(
    (s) => s.badge === 'external' || s.cls === 'external-svc',
  );
  const accountCandid = userServices.filter(
    (s) => s.badge === 'candid' || s.pending || s.filter.includes('candid'),
  );

  const candid: ServiceCardModel[] = [...portalCandid];
  for (const svc of accountCandid) {
    if (!candid.some((p) => servicesOverlap(p, svc))) {
      candid.push(svc);
    }
  }

  return [...candid, ...accountExternal];
}
