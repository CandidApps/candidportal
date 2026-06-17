import type { Customer, Contact, Location } from '@/components/CustomersView';
import type {
  CandidContractRecord,
  CustomerDocument,
  PortingInfo,
  RecordKind,
  ServiceBreakdown,
} from '@/lib/customer-records';
import { parentMerchantFor } from '@/lib/bmw/deal-master';
import { getCrmRuntimeData } from '@/lib/crm/runtime-store';

let importMerchantsByKey = new Map<string, ImportMerchant>();

/** Register portal-import merchants (import script / one-time local seed only). */
export function registerImportMerchants(merchants: Record<string, ImportMerchant>): void {
  importMerchantsByKey = new Map();
  for (const [bmwName, imp] of Object.entries(merchants)) {
    importMerchantsByKey.set(normalizeMerchantKey(bmwName), imp);
    importMerchantsByKey.set(merchantNameKey(bmwName), imp);
    if (imp.bmwMerchantName) {
      importMerchantsByKey.set(normalizeMerchantKey(imp.bmwMerchantName), imp);
      importMerchantsByKey.set(merchantNameKey(imp.bmwMerchantName), imp);
    }
  }
}

export function clearImportMerchants(): void {
  importMerchantsByKey = new Map();
}

export type PortalRenewalAlert = {
  provider: string;
  renewalDate: string;
  alert60Days?: string;
  daysUntilRenewal?: number;
  priority?: string;
  note?: string;
  dealUid?: string | null;
};

export type PortalOptimization = {
  type: string;
  detail: string;
  potentialImpact?: string;
};

export type CustomerActionKind = 'renewal' | 'optimization' | 'custom';
export type CustomerActionSeverity = 'urgent' | 'soon' | 'info';
export type CustomerActionSource = 'portal' | 'custom';

export type CustomerAction = {
  id: string;
  kind: CustomerActionKind;
  severity: CustomerActionSeverity;
  title: string;
  detail: string;
  dueDate?: string;
  provider?: string;
  suggestedAction: string;
  source?: CustomerActionSource;
};

export type PortalPreviousProvider = {
  provider: string;
  accountNum?: string;
  lastInvoiceNum?: string;
  lastInvoiceDate?: string;
  lastInvoiceAmount?: number | null;
  annualCost?: number | null;
  effectiveRate?: string | null;
  product?: string;
  note?: string;
  users?: number | null;
  lines?: unknown;
  breakdown?: unknown;
  numbersPorted?: string | null;
  portDate?: string | null;
};

export type PortalNonCandidService = {
  provider: string;
  product: string;
  accountNum: string;
  mrc: number | null;
  isCandid: boolean;
  note: string;
  lines: unknown;
};

export type CustomerPortalData = {
  importCustomerId: string;
  displayName?: string;
  bmwMerchantName: string;
  totalCandidMrc?: number;
  previousProviderMrc?: number | null;
  savingsVsPrevious?: number | null;
  billingCycle?: string;
  financialNotes?: string;
  previousProvider?: PortalPreviousProvider | null;
  nonCandidServices?: PortalNonCandidService[];
  renewalAlerts: PortalRenewalAlert[];
  optimizations: PortalOptimization[];
  salesPitch?: { opening: string; totalCandidMrc: string } | null;
  onedriveFolder?: string;
  actions: CustomerAction[];
};

type ImportMerchant = {
  importCustomerId: string;
  bmwMerchantName: string;
  displayName: string;
  folderName: string;
  website: string;
  description: string;
  industry: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  primaryContact: {
    name?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  totalCandidMrc: number;
  previousProviderMrc: number | null;
  savingsVsPrevious: number | null;
  billingCycle: string;
  financialNotes: string;
  previousProvider: PortalPreviousProvider | null;
  nonCandidServices: PortalNonCandidService[];
  deals: Array<{
    dealId?: string;
    dealUid?: string | null;
    provider?: string;
    product?: string;
    serviceDescription?: string;
    paySource?: string;
    isCandid?: boolean;
    mrc?: number;
    promoMrc?: number | null;
    annualBilling?: boolean;
    yr1Annual?: number | null;
    yr2Annual?: number | null;
    contractSignDate?: string | null;
    contractStartDate?: string;
    contractEndDate?: string;
    contractTermMonths?: number | null;
    alert60Days?: string;
    renewalNoticeDate?: string | null;
    status?: string;
    salesOrderRef?: string;
    salesOrderNum?: string;
    contactAtSigning?: string;
    providerAccountNum?: string;
    agent?: string;
    commissionRate?: number | null;
    commissionType?: string;
    equipmentNote?: string;
    note?: string;
    serviceBreakdown?: ServiceBreakdown | null;
    portingInfo?: PortingInfo | null;
  }>;
  renewalAlerts: PortalRenewalAlert[];
  optimizations: PortalOptimization[];
  salesPitch: { opening: string; totalCandidMrc: string } | null;
  onedriveFolder: string;
  importRowCount: number;
};

type ImportDocument = {
  id: string;
  customerId: string;
  filename: string;
  recordKind: string;
  provider: string;
  docSubtype: string;
  signedDate: string | null;
  signedBy: string;
  invoiceDate: string | null;
  amount: number | null;
  roiNote: string;
  description: string;
  onedrivePath: string;
  docLocation: string;
  docStatus: string;
  onDisk: boolean;
  uploadedBy: string;
  date: string;
  size: string;
};

function allKnownFilenames(): Set<string> {
  const names = new Set<string>();
  for (const docs of Object.values(getCrmRuntimeData().documentsByCustomerId)) {
    for (const doc of docs) {
      if (doc.filename) names.add(doc.filename);
    }
  }
  return names;
}

function findDocumentByFilename(filename: string): CustomerDocument | undefined {
  for (const docs of Object.values(getCrmRuntimeData().documentsByCustomerId)) {
    const hit = docs.find((d) => d.filename === filename);
    if (hit) return hit;
  }
  return undefined;
}

export function portalDocumentUrl(filename: string): string | null {
  const doc = findDocumentByFilename(filename);
  if (doc) {
    const recordKey = doc.customerId ? `${doc.customerId}::${doc.id}` : doc.id;
    return `/api/admin/crm/documents?recordId=${encodeURIComponent(recordKey)}`;
  }
  if (!allKnownFilenames().has(filename)) return null;
  return `/api/admin/crm/documents?file=${encodeURIComponent(filename)}`;
}

export function isPortalDocumentAvailable(filename: string): boolean {
  return Boolean(findDocumentByFilename(filename)) || allKnownFilenames().has(filename);
}

function normalizeMerchantKey(name: string): string {
  return parentMerchantFor(name.trim());
}

function merchantNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\band\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function portalMerchantFromCustomer(customer: Customer): ImportMerchant | null {
  const portal = customer.portal;
  if (!portal?.importCustomerId) return null;
  return {
    importCustomerId: portal.importCustomerId,
    bmwMerchantName: portal.bmwMerchantName,
    displayName: portal.displayName ?? customer.company,
    folderName: '',
    website: customer.website ?? '',
    description: customer.description ?? '',
    industry: customer.industry ?? '',
    address: customer.locations[0]?.street ?? '',
    city: customer.locations[0]?.city ?? '',
    state: customer.locations[0]?.state ?? '',
    zip: customer.locations[0]?.zip ?? '',
    phone: '',
    email: '',
    primaryContact: null,
    totalCandidMrc: portal.totalCandidMrc ?? 0,
    previousProviderMrc: portal.previousProviderMrc ?? null,
    savingsVsPrevious: portal.savingsVsPrevious ?? null,
    billingCycle: portal.billingCycle ?? '',
    financialNotes: portal.financialNotes ?? '',
    previousProvider: portal.previousProvider ?? null,
    nonCandidServices: portal.nonCandidServices ?? [],
    deals: [],
    renewalAlerts: portal.renewalAlerts ?? [],
    optimizations: portal.optimizations ?? [],
    salesPitch: portal.salesPitch ?? null,
    onedriveFolder: portal.onedriveFolder ?? '',
    importRowCount: 1,
  };
}

function findImportForCustomer(customer: Customer): ImportMerchant | null {
  const fromPortal = portalMerchantFromCustomer(customer);
  if (fromPortal) return fromPortal;

  const keys = [
    normalizeMerchantKey(customer.company),
    merchantNameKey(customer.company),
    customer.companyLegal ? normalizeMerchantKey(customer.companyLegal) : '',
    customer.companyLegal ? merchantNameKey(customer.companyLegal) : '',
  ].filter(Boolean);

  for (const key of keys) {
    const hit = importMerchantsByKey.get(key);
    if (hit) return hit;
  }
  return null;
}

function matchedImportMerchants(customers: Customer[]): Set<string> {
  const matched = new Set<string>();
  for (const customer of customers) {
    const imp = findImportForCustomer(customer);
    if (imp) matched.add(imp.bmwMerchantName);
  }
  return matched;
}

function inferPortalCustomerStatus(imp: ImportMerchant): Customer['status'] {
  const deals = imp.deals ?? [];
  if (deals.some((d) => /^active$/i.test(d.status ?? ''))) return 'active';
  if (deals.some((d) => /^inactive$/i.test(d.status ?? ''))) return 'inactive';
  if ((imp.totalCandidMrc ?? 0) > 0) return 'active';
  return 'prospect';
}

function agentFromImportFolder(folderName: string): string {
  const segment = folderName.split('/')[0]?.trim();
  return segment || 'Unassigned';
}

function customerFromImportMerchant(imp: ImportMerchant): Customer {
  const id = `portal-${imp.importCustomerId}`;
  const company = imp.displayName || imp.bmwMerchantName;
  const importDocCount =
    getCrmRuntimeData().documentsByCustomerId[id]?.length ??
    getCrmRuntimeData().documentsByCustomerId[imp.importCustomerId]?.length ??
    0;

  const contacts: Contact[] = [];
  const pc = imp.primaryContact;
  if (pc?.name) {
    contacts.push({
      id: `${id}-contact`,
      name: pc.name,
      role: pc.title ?? 'Primary Contact',
      email: pc.email ?? '',
      phone: pc.phone ?? '',
      isPrimary: true,
    });
  }

  const locations: Location[] = [];
  if (imp.address || imp.city) {
    locations.push({
      id: `${id}-loc`,
      label: 'Primary',
      street: imp.address,
      city: imp.city,
      state: imp.state,
      zip: imp.zip,
      isPrimary: true,
    });
  }

  const base: Customer = {
    id,
    company,
    companyLegal: company,
    industry: imp.industry || undefined,
    description: imp.description || undefined,
    website: imp.website || undefined,
    status: inferPortalCustomerStatus(imp),
    agent: agentFromImportFolder(imp.folderName),
    spend: Math.round(imp.totalCandidMrc ?? 0),
    savings: imp.savingsVsPrevious ?? 0,
    contracts: imp.deals?.length ?? 0,
    files: importDocCount,
    since: 'Portal import',
    contacts,
    locations,
  };

  return mergePortalImportIntoCustomer(base);
}

function buildPortalOnlyCustomers(existing: Customer[]): Customer[] {
  if (!importMerchantsByKey.size) return [];

  const matched = matchedImportMerchants(existing);
  const portalOnly: Customer[] = [];
  const seen = new Set<string>();

  for (const imp of importMerchantsByKey.values()) {
    if (matched.has(imp.bmwMerchantName) || seen.has(imp.importCustomerId)) continue;
    seen.add(imp.importCustomerId);
    portalOnly.push(customerFromImportMerchant(imp));
  }

  return portalOnly.sort((a, b) => a.company.localeCompare(b.company));
}

function renewalSeverity(alert: PortalRenewalAlert): CustomerActionSeverity {
  const days = alert.daysUntilRenewal;
  if (alert.priority?.toUpperCase().includes('HIGH')) return 'urgent';
  if (typeof days === 'number') {
    if (days <= 60) return 'urgent';
    if (days <= 180) return 'soon';
  }
  return 'info';
}

function isSkippableOptimization(opt: PortalOptimization): boolean {
  const t = opt.type.toLowerCase();
  return t.includes('reference folder') || t.includes('billing cycle note');
}

export function buildCustomerActions(
  customerId: string,
  alerts: PortalRenewalAlert[],
  optimizations: PortalOptimization[],
): CustomerAction[] {
  const actions: CustomerAction[] = [];

  for (const alert of alerts) {
    const severity = renewalSeverity(alert);
    if (severity === 'info') continue;

    const days = alert.daysUntilRenewal;
    const daysLabel =
      typeof days === 'number' ? `${days} days` : 'soon';

    actions.push({
      id: `${customerId}-renewal-${alert.provider}-${alert.renewalDate}`,
      kind: 'renewal',
      source: 'portal',
      severity,
      title: `${alert.provider} renewal ${severity === 'urgent' ? '— act now' : 'upcoming'}`,
      detail: [
        `Renewal date: ${alert.renewalDate}`,
        alert.alert60Days ? `60-day alert: ${alert.alert60Days}` : '',
        alert.note,
        alert.priority,
      ]
        .filter(Boolean)
        .join(' · '),
      dueDate: alert.renewalDate,
      provider: alert.provider,
      suggestedAction:
        severity === 'urgent'
          ? 'Start renewal conversation and prepare competitive quotes before auto-renew.'
          : 'Add to renewal pipeline and review pricing 90 days before contract end.',
    });
  }

  for (const opt of optimizations) {
    if (isSkippableOptimization(opt)) continue;
    const detail = opt.detail || opt.potentialImpact || '';
    if (!detail.trim()) continue;

    actions.push({
      id: `${customerId}-opt-${opt.type}`.replace(/\s+/g, '-').slice(0, 80),
      kind: 'optimization',
      source: 'portal',
      severity: 'info',
      title: opt.type,
      detail,
      suggestedAction: 'Review with customer on next check-in or savings review.',
    });
  }

  const rank = { urgent: 0, soon: 1, info: 2 };
  return actions.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function enrichContact(existing: Contact[], importContact: ImportMerchant['primaryContact'], customerId: string): Contact[] {
  if (!importContact?.name) return existing;
  const primary = existing.find((c) => c.isPrimary) ?? existing[0];
  const email = importContact.email ?? '';
  const phone = importContact.phone ?? '';

  if (primary) {
    return existing.map((c) =>
      c.id === primary.id
        ? {
            ...c,
            name: c.name || importContact.name || c.name,
            role: c.role || importContact.title || c.role,
            email: c.email || importContact.email || '',
            phone: c.phone || importContact.phone || '',
          }
        : c,
    );
  }

  return [
    {
      id: `${customerId}-import-contact`,
      name: importContact.name ?? 'Primary Contact',
      role: importContact.title ?? 'Primary Contact',
      email: importContact.email ?? '',
      phone: importContact.phone ?? '',
      isPrimary: true,
    },
    ...existing,
  ];
}

function enrichLocation(existing: Location[], imp: ImportMerchant, customerId: string): Location[] {
  if (!imp.address && !imp.city) return existing;
  const primary = existing.find((l) => l.isPrimary) ?? existing[0];
  if (primary) {
    return existing.map((l) =>
      l.id === primary.id
        ? {
            ...l,
            street: l.street || imp.address,
            city: l.city || imp.city,
            state: l.state || imp.state,
            zip: l.zip || imp.zip,
          }
        : l,
    );
  }
  return [
    {
      id: `${customerId}-import-loc`,
      label: 'Primary',
      street: imp.address,
      city: imp.city,
      state: imp.state,
      zip: imp.zip,
      isPrimary: true,
    },
    ...existing,
  ];
}

export function mergePortalImportIntoCustomer(customer: Customer): Customer {
  const imp = findImportForCustomer(customer);
  if (!imp) return customer;

  const renewalAlerts = imp.renewalAlerts ?? [];
  const optimizations = imp.optimizations ?? [];
  const actions = buildCustomerActions(customer.id, renewalAlerts, optimizations);

  const portal: CustomerPortalData = {
    importCustomerId: imp.importCustomerId,
    displayName: imp.displayName,
    bmwMerchantName: imp.bmwMerchantName,
    totalCandidMrc: imp.totalCandidMrc,
    previousProviderMrc: imp.previousProviderMrc,
    savingsVsPrevious: imp.savingsVsPrevious,
    billingCycle: imp.billingCycle,
    financialNotes: imp.financialNotes,
    previousProvider: imp.previousProvider,
    nonCandidServices: imp.nonCandidServices ?? [],
    renewalAlerts,
    optimizations,
    salesPitch: imp.salesPitch,
    onedriveFolder: imp.onedriveFolder,
    actions,
  };

  const mrc = imp.totalCandidMrc;
  const spend = mrc > 0 ? Math.round(mrc) : customer.spend;
  const importDocCount =
    getCrmRuntimeData().documentsByCustomerId[customer.id]?.length ?? 0;
  const importDealCount = imp.deals?.length ?? 0;

  return {
    ...customer,
    companyLegal: customer.companyLegal ?? imp.displayName,
    industry: imp.industry || customer.industry,
    description: imp.description || customer.description,
    website: imp.website || customer.website,
    spend,
    files: (customer.files ?? 0) + importDocCount,
    contracts: (customer.contracts ?? 0) + importDealCount,
    contacts: enrichContact(customer.contacts, imp.primaryContact, customer.id),
    locations: enrichLocation(customer.locations, imp, customer.id),
    portal,
  };
}

export function applyPortalImportToCustomers(customers: Customer[]): Customer[] {
  const enriched = customers.map(mergePortalImportIntoCustomer);
  const portalOnly = buildPortalOnlyCustomers(customers);
  return [...enriched, ...portalOnly].sort((a, b) => a.company.localeCompare(b.company));
}

export function buildPortalImportDocuments(
  customers: Customer[],
  _options?: { includeOffDisk?: boolean },
): Record<string, CustomerDocument[]> {
  const runtimeDocs = getCrmRuntimeData().documentsByCustomerId;
  if (Object.keys(runtimeDocs).length > 0) {
    return runtimeDocs;
  }

  const out: Record<string, CustomerDocument[]> = {};
  for (const customer of customers) {
    if (customer.portal) {
      out[customer.id] = [];
    }
  }
  return out;
}

export function buildPortalImportContracts(customers: Customer[]): Record<string, CandidContractRecord[]> {
  const out: Record<string, CandidContractRecord[]> = {};

  for (const customer of customers) {
    const imp = findImportForCustomer(customer);
    if (!imp?.deals?.length) continue;

    const primaryLoc =
      customer.locations.find((l) => l.isPrimary)?.id ?? customer.locations[0]?.id ?? `${customer.id}-loc`;

    out[customer.id] = imp.deals.map((deal, i) => {
      const end = deal.contractEndDate ?? '';
      const days = end
        ? Math.ceil((new Date(end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      let dealStatus: CandidContractRecord['dealStatus'] = 'active';
      if (days != null && days <= 0) dealStatus = 'expired';
      else if (days != null && days <= 90) dealStatus = 'expiring';

      return {
        id: `import-${customer.id}-${deal.dealId ?? i}`,
        customerId: customer.id,
        locationId: primaryLoc,
        dealId: deal.dealId ?? deal.dealUid ?? undefined,
        paySource: deal.paySource,
        solution: deal.provider,
        vendor: deal.provider ?? 'Unknown',
        service: deal.product ?? deal.provider ?? 'Service',
        product: deal.product,
        solutionDescription: deal.serviceDescription,
        serviceBreakdown: deal.serviceBreakdown ?? undefined,
        portingInfo: deal.portingInfo ?? undefined,
        salesOrderRef: deal.salesOrderRef || undefined,
        salesOrderNum: deal.salesOrderNum || undefined,
        providerAccountNum: deal.providerAccountNum || undefined,
        isCandid: deal.isCandid,
        annualBilling: deal.annualBilling,
        promoMrc: deal.promoMrc ?? undefined,
        yr1Annual: deal.yr1Annual ?? undefined,
        yr2Annual: deal.yr2Annual ?? undefined,
        contractSignDate: deal.contractSignDate ?? undefined,
        contractTermMonths: deal.contractTermMonths ?? undefined,
        alert60Days: deal.alert60Days,
        renewalNoticeDate: deal.renewalNoticeDate ?? undefined,
        contactAtSigning: deal.contactAtSigning || undefined,
        equipmentNote: deal.equipmentNote || undefined,
        dealNote: deal.note || undefined,
        commissionType: deal.commissionType || undefined,
        agentCommissionRate: deal.commissionRate ?? undefined,
        agentOfRecord: deal.agent || undefined,
        mrc: deal.mrc,
        monthly: deal.mrc ?? 0,
        contractStartDate: deal.contractStartDate,
        contractEndDate: deal.contractEndDate,
        expires: end || '—',
        dealStatus,
        autoRenews: false,
        physicalLocationId: primaryLoc,
        billingLocationId: primaryLoc,
      };
    });
  }

  return out;
}

export function getPortalImportStats() {
  const data = getCrmRuntimeData();
  return {
    merchants: data.customers.length,
    importRows: data.customers.length,
    totalDocuments: Object.values(data.documentsByCustomerId).flat().length,
    documentsOnDisk: Object.values(data.documentsByCustomerId).flat().filter((d) => d.storagePath).length,
  };
}
