import type { Contact, Customer, Location } from '@/components/CustomersView';
import type { CandidContractRecord } from '@/lib/customer-records';
import type { PortalAccessTier } from '@/lib/portal-access';
import {
  contactToRow,
  customerToRow,
  locationToRow,
  type CrmImportPayload,
} from '@/lib/crm/db-mapper';
import {
  cell,
  cellNumber,
  downloadCsv,
  downloadMultiSheetXlsx,
  normalizeHeader,
  parseMultiSheetSpreadsheetFile,
  parseSpreadsheetFile,
  rowsToObjects,
  splitList,
  type SheetRow,
} from '@/lib/spreadsheet-io';
import {
  CUSTOMER_ENRICHMENT_FIELD_META,
  type CustomerEnrichmentFields,
} from '@/lib/crm/customer-enrichment';

const ACCOUNTS_SHEET = 'Accounts';
const CONTACTS_SHEET = 'Contacts';
const LOCATIONS_SHEET = 'Locations';
const DEALS_SHEET = 'Deals';

function yesNo(value: string): boolean {
  return /^(y|yes|true|1)$/i.test(value.trim());
}

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fallbackId(prefix: string, ...parts: string[]): string {
  const base = parts.map(slugPart).filter(Boolean).join('-');
  return (base ? `${prefix}-${base}` : `${prefix}-${Date.now()}`).slice(0, 120);
}

function normalizeStatus(value: string): Customer['status'] {
  const v = value.trim().toLowerCase();
  if (v === 'inactive') return 'inactive';
  if (v === 'prospect') return 'prospect';
  return 'active';
}

function normalizePortalTier(value: string): PortalAccessTier | null {
  const v = value.trim().toLowerCase();
  if (v === 'full') return 'full';
  if (v === 'trial') return 'trial';
  return null;
}

export function customersToAccountsSheet(
  customers: Customer[],
  opts: { commissionByCustomer?: Record<string, number>; commissionColumn?: string } = {},
): SheetRow[] {
  const commissionByCustomer = opts.commissionByCustomer ?? {};
  const commissionColumn = opts.commissionColumn ?? 'Cycle Commission';
  return customers.map((c) => ({
    'Account ID': c.id,
    'Company Name': c.company,
    'Legal Name': c.companyLegal ?? null,
    Industry: c.industry ?? null,
    Description: c.description ?? null,
    Website: c.website ?? null,
    'Alt Website': c.altWebsite ?? null,
    LinkedIn: c.linkedinUrl ?? null,
    'Tax ID': c.taxId ?? null,
    'MCC Code': c.mccCode ?? null,
    'Corp Type': c.corpType ?? null,
    Status: c.status,
    'Sales Agent': c.agent,
    'Monthly Spend': c.spend,
    [commissionColumn]: commissionByCustomer[c.id] ?? null,
    Savings: c.savings,
    'Contracts Count': c.contracts,
    'Files Count': c.files,
    'Customer Since': c.since,
    Notes: c.notes ?? null,
    ...Object.fromEntries(
      CUSTOMER_ENRICHMENT_FIELD_META.map((meta) => [meta.label, c[meta.key] ?? null]),
    ),
  }));
}

export function customersToContactsSheet(customers: Customer[]): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const customer of customers) {
    for (const contact of customer.contacts) {
      rows.push({
        'Contact ID': contact.id,
        'Account ID': customer.id,
        'Account Name': customer.company,
        Name: contact.name,
        Role: contact.role,
        Email: contact.email,
        'Alt Email': contact.altEmail ?? null,
        Phone: contact.phone,
        Primary: contact.isPrimary ? 'Y' : 'N',
        'Ownership %': contact.ownershipPct ?? null,
        'Location IDs': (contact.locationIds ?? []).join('; '),
        'CRM Notes': contact.crmNotes ?? null,
        'Portal Access': contact.portalAccess ? 'Y' : 'N',
        'Portal Access Tier': contact.portalAccessTier ?? null,
      });
    }
  }
  return rows;
}

export function customersToLocationsSheet(customers: Customer[]): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const customer of customers) {
    for (const location of customer.locations) {
      rows.push({
        'Location ID': location.id,
        'Account ID': customer.id,
        'Account Name': customer.company,
        Label: location.label,
        Street: location.street,
        City: location.city,
        State: location.state,
        ZIP: location.zip,
        Primary: location.isPrimary ? 'Y' : 'N',
      });
    }
  }
  return rows;
}

export function customersToDealsSheet(
  customers: Customer[],
  contractsByCustomerId: Record<string, CandidContractRecord[]> = {},
): SheetRow[] {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const rows: SheetRow[] = [];

  const customerIds = new Set([
    ...customers.map((c) => c.id),
    ...Object.keys(contractsByCustomerId),
  ]);

  for (const customerId of customerIds) {
    const customer = byId.get(customerId);
    const contracts = contractsByCustomerId[customerId] ?? [];
    for (const deal of contracts) {
      const location =
        customer?.locations.find((l) => l.id === deal.locationId) ??
        customer?.locations.find((l) => l.id === deal.physicalLocationId);
      rows.push({
        'Account ID': customer?.id ?? deal.customerId ?? customerId,
        'Account Name': customer?.company ?? '',
        'Deal ID': deal.id,
        'Deal UID': deal.dealId ?? null,
        'Agent Comm ID': deal.agentCommId ?? null,
        'Agent of Record': deal.agentOfRecord ?? null,
        'Pay Source': deal.paySource ?? null,
        Vendor: deal.vendor || deal.solution || null,
        Solution: deal.solution ?? null,
        Product: deal.product ?? null,
        Service: deal.service ?? null,
        'Base Service': deal.baseService ?? null,
        'Service Detail': deal.serviceDetail ?? null,
        Status: deal.dealStatus,
        MRC: deal.mrc ?? deal.monthly ?? null,
        MRR: deal.mrr ?? null,
        Monthly: deal.monthly ?? null,
        'Contract Start': deal.contractStartDate ?? deal.contractSignDate ?? null,
        'Contract End': deal.contractEndDate ?? deal.expires ?? null,
        'Term Months': deal.contractTermMonths ?? null,
        'Auto Renews': deal.autoRenews ? 'Y' : 'N',
        'Commission Type': deal.commissionType ?? null,
        'Candid Commission %': deal.candidCommissionRate ?? null,
        'Agent Commission %': deal.agentCommissionRate ?? null,
        'Commission Amount': deal.commissionAmount ?? null,
        'SPIFF Expected': deal.spiffExpected ?? null,
        'Provider Account #': deal.providerAccountNum ?? null,
        'Sales Order #': deal.salesOrderNum ?? deal.salesOrderRef ?? null,
        'Location ID': deal.locationId || deal.physicalLocationId || null,
        'Location Label': location?.label ?? null,
        'Is Candid': deal.isCandid ? 'Y' : 'N',
        'Contact at Signing': deal.contactAtSigning ?? null,
        'Deal Note': deal.dealNote ?? null,
      });
    }
  }

  rows.sort((a, b) => {
    const company = String(a['Account Name'] ?? '').localeCompare(String(b['Account Name'] ?? ''));
    if (company) return company;
    return String(a['Deal UID'] ?? a['Deal ID'] ?? '').localeCompare(
      String(b['Deal UID'] ?? b['Deal ID'] ?? ''),
    );
  });

  return rows;
}

function commissionColumnLabel(period?: string): string {
  if (!period) return 'Cycle Commission';
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return 'Cycle Commission';
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
  return `Commission (${label})`;
}

export async function exportCustomersXlsx(
  customers: Customer[],
  contractsByCustomerId: Record<string, CandidContractRecord[]> = {},
  opts: {
    commissionByCustomer?: Record<string, number>;
    commissionPeriod?: string;
    filename?: string;
  } = {},
): Promise<void> {
  const filename = opts.filename ?? 'accounts-export.xlsx';
  const commissionColumn = commissionColumnLabel(opts.commissionPeriod);
  await downloadMultiSheetXlsx(filename, [
    {
      name: ACCOUNTS_SHEET,
      rows: customersToAccountsSheet(customers, {
        commissionByCustomer: opts.commissionByCustomer,
        commissionColumn,
      }),
    },
    { name: CONTACTS_SHEET, rows: customersToContactsSheet(customers) },
    { name: LOCATIONS_SHEET, rows: customersToLocationsSheet(customers) },
    { name: DEALS_SHEET, rows: customersToDealsSheet(customers, contractsByCustomerId) },
  ]);
}

export async function exportCustomersCsv(
  customers: Customer[],
  filename = 'accounts-export.csv',
): Promise<void> {
  await downloadCsv(filename, customersToAccountsSheet(customers));
}

function sheetRows(sheets: Record<string, SheetRow[]>, ...aliases: string[]): SheetRow[] {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const rows = sheets[key];
    if (rows?.length) return rows;
  }
  return [];
}

function parseAccountRow(row: SheetRow): Omit<CrmImportPayload['customers'][number], never> | null {
  const company = cell(row, 'Company Name', 'company', 'account name');
  const accountId = cell(row, 'Account ID', 'account_id', 'customer id', 'customer_id', 'id');
  if (!company && !accountId) return null;

  const enrichment: CustomerEnrichmentFields = {};
  for (const meta of CUSTOMER_ENRICHMENT_FIELD_META) {
    const value = cell(row, ...meta.spreadsheet);
    if (value) enrichment[meta.key] = value;
  }

  const customer: Customer = {
    id: accountId || fallbackId('acct', company),
    company: company || accountId,
    companyLegal: cell(row, 'Legal Name', 'company_legal') || undefined,
    industry: cell(row, 'Industry', 'industry') || undefined,
    description: cell(row, 'Description', 'description') || undefined,
    website: cell(row, 'Website', 'website') || undefined,
    altWebsite: cell(row, 'Alt Website', 'alt_website', 'alt website') || undefined,
    linkedinUrl: cell(row, 'LinkedIn', 'linkedin', 'linkedin_url', 'LinkedIn URL') || undefined,
    taxId: cell(row, 'Tax ID', 'tax_id') || undefined,
    mccCode: cell(row, 'MCC Code', 'mcc_code') || undefined,
    corpType: cell(row, 'Corp Type', 'corp_type') || undefined,
    notes: cell(row, 'Notes', 'notes') || undefined,
    ...enrichment,
    status: normalizeStatus(cell(row, 'Status', 'status') || 'active'),
    agent: cell(row, 'Sales Agent', 'agent', 'sales agent') || 'Unassigned',
    spend: cellNumber(row, 'Monthly Spend', 'spend', 'monthly spend') ?? 0,
    savings: cellNumber(row, 'Savings', 'savings') ?? 0,
    contracts: cellNumber(row, 'Contracts Count', 'contracts_count', 'contracts') ?? 0,
    files: cellNumber(row, 'Files Count', 'files_count', 'files') ?? 0,
    since: cell(row, 'Customer Since', 'since', 'since_label') || 'CRM',
    contacts: [],
    locations: [],
  };

  return customerToRow(customer);
}

function parseLocationRow(
  row: SheetRow,
  customerExternalId: string,
): Omit<CrmImportPayload['locations'][number]['row'], never> | null {
  const accountId = cell(row, 'Account ID', 'account_id', 'customer id', 'customer_id');
  const resolvedAccountId = accountId || customerExternalId;
  if (!resolvedAccountId) return null;

  const label = cell(row, 'Label', 'label', 'location name');
  const locationId = cell(row, 'Location ID', 'location_id', 'id') || fallbackId('loc', resolvedAccountId, label || 'location');

  const location: Location = {
    id: locationId,
    label: label || 'Location',
    street: cell(row, 'Street', 'street', 'address') || '',
    city: cell(row, 'City', 'city') || '',
    state: cell(row, 'State', 'state') || '',
    zip: cell(row, 'ZIP', 'zip', 'postal code', 'postal_code') || '',
    isPrimary: yesNo(cell(row, 'Primary', 'is_primary', 'primary')),
  };

  const { customer_id: _c, ...dbRow } = locationToRow('', location);
  return dbRow;
}

function parseContactRow(
  row: SheetRow,
  customerExternalId: string,
): Omit<CrmImportPayload['contacts'][number]['row'], never> | null {
  const accountId = cell(row, 'Account ID', 'account_id', 'customer id', 'customer_id');
  const resolvedAccountId = accountId || customerExternalId;
  if (!resolvedAccountId) return null;

  const name = cell(row, 'Name', 'name', 'contact name');
  const email = cell(row, 'Email', 'email');
  if (!name && !email) return null;

  const contactId =
    cell(row, 'Contact ID', 'contact_id', 'id') || fallbackId('contact', resolvedAccountId, name || email);

  const locationIdsRaw = cell(row, 'Location IDs', 'location_ids', 'locations');
  const portalTier = normalizePortalTier(cell(row, 'Portal Access Tier', 'portal_access_tier'));

  const contact: Contact = {
    id: contactId,
    name: name || email,
    role: cell(row, 'Role', 'role') || '',
    email,
    altEmail: cell(row, 'Alt Email', 'alt_email', 'alt email') || undefined,
    phone: cell(row, 'Phone', 'phone') || '',
    isPrimary: yesNo(cell(row, 'Primary', 'is_primary', 'primary')),
    ownershipPct: cellNumber(row, 'Ownership %', 'ownership_pct', 'ownership') ?? undefined,
    locationIds: locationIdsRaw ? splitList(locationIdsRaw) : [],
    crmNotes: cell(row, 'CRM Notes', 'crm_notes', 'notes') || undefined,
    portalAccess: yesNo(cell(row, 'Portal Access', 'portal_access')),
    portalAccessTier: portalTier ?? undefined,
  };

  const { customer_id: _c, ...dbRow } = contactToRow('', contact);
  return dbRow;
}

export function parseCustomersImportSheets(
  sheets: Record<string, SheetRow[]>,
): Pick<CrmImportPayload, 'customers' | 'locations' | 'contacts'> {
  const accountRows = rowsToObjects(
    sheetRows(sheets, ACCOUNTS_SHEET, 'accounts', 'account', 'customers', 'customer'),
  );
  const contactRows = rowsToObjects(
    sheetRows(sheets, CONTACTS_SHEET, 'contacts', 'contact'),
  );
  const locationRows = rowsToObjects(
    sheetRows(sheets, LOCATIONS_SHEET, 'locations', 'location'),
  );

  const customers: CrmImportPayload['customers'] = [];
  const knownAccountIds = new Set<string>();

  for (const row of accountRows) {
    const parsed = parseAccountRow(row);
    if (!parsed) continue;
    customers.push(parsed);
    knownAccountIds.add(parsed.external_id);
  }

  for (const row of contactRows) {
    const accountId = cell(row, 'Account ID', 'account_id', 'customer id', 'customer_id');
    if (accountId && !knownAccountIds.has(accountId)) {
      const company = cell(row, 'Account Name', 'company', 'account name');
      if (company || accountId) {
        customers.push(
          customerToRow({
            id: accountId,
            company: company || accountId,
            status: 'active',
            agent: 'Unassigned',
            spend: 0,
            savings: 0,
            contracts: 0,
            files: 0,
            since: 'CRM',
            contacts: [],
            locations: [],
          }),
        );
        knownAccountIds.add(accountId);
      }
    }
  }

  for (const row of locationRows) {
    const accountId = cell(row, 'Account ID', 'account_id', 'customer id', 'customer_id');
    if (accountId && !knownAccountIds.has(accountId)) {
      const company = cell(row, 'Account Name', 'company', 'account name');
      if (company || accountId) {
        customers.push(
          customerToRow({
            id: accountId,
            company: company || accountId,
            status: 'active',
            agent: 'Unassigned',
            spend: 0,
            savings: 0,
            contracts: 0,
            files: 0,
            since: 'CRM',
            contacts: [],
            locations: [],
          }),
        );
        knownAccountIds.add(accountId);
      }
    }
  }

  const locations: CrmImportPayload['locations'] = [];
  for (const row of locationRows) {
    const accountId = cell(row, 'Account ID', 'account_id', 'customer id', 'customer_id');
    if (!accountId || !knownAccountIds.has(accountId)) continue;
    const parsed = parseLocationRow(row, accountId);
    if (parsed) locations.push({ customerExternalId: accountId, row: parsed });
  }

  const contacts: CrmImportPayload['contacts'] = [];
  for (const row of contactRows) {
    const accountId = cell(row, 'Account ID', 'account_id', 'customer id', 'customer_id');
    if (!accountId || !knownAccountIds.has(accountId)) continue;
    const parsed = parseContactRow(row, accountId);
    if (parsed) contacts.push({ customerExternalId: accountId, row: parsed });
  }

  return { customers, locations, contacts };
}

export async function importCustomersFromFile(file: File): Promise<{
  customers: number;
  contacts: number;
  locations: number;
}> {
  const lower = file.name.toLowerCase();
  const sheets =
    lower.endsWith('.csv') || lower.endsWith('.tsv')
      ? { accounts: rowsToObjects(await parseSpreadsheetFile(file)) }
      : await parseMultiSheetSpreadsheetFile(file);

  const payload = parseCustomersImportSheets(sheets);
  if (!payload.customers.length && !payload.contacts.length && !payload.locations.length) {
    throw new Error('No recognizable account, contact, or location rows found in the file.');
  }

  const res = await fetch('/api/admin/crm/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    customers?: number;
    contacts?: number;
    locations?: number;
  };
  if (!res.ok) throw new Error(json.error ?? 'Import failed');

  return {
    customers: json.customers ?? payload.customers.length,
    contacts: json.contacts ?? payload.contacts.length,
    locations: json.locations ?? payload.locations.length,
  };
}
