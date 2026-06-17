#!/usr/bin/env node
/**
 * Reads candid_portal_MASTER_import.json (+ optional candid_portal_DELTA_import.json)
 * and candid_portal_all_docs/, then writes src/data/portal-import/index.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const masterPath = path.join(root, 'candid_portal_MASTER_import.json');
const deltaPath = path.join(root, 'candid_portal_DELTA_import.json');
const docsDir = path.join(root, 'candid_portal_all_docs');
const outDir = path.join(root, 'src/data/portal-import');
const outPath = path.join(outDir, 'index.json');

function loadImportRows() {
  const sources = [];
  const rows = [];

  if (fs.existsSync(masterPath)) {
    const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
    sources.push('candid_portal_MASTER_import.json');
    rows.push(...(master.customers ?? []));
  }

  if (fs.existsSync(deltaPath)) {
    const delta = JSON.parse(fs.readFileSync(deltaPath, 'utf8'));
    sources.push('candid_portal_DELTA_import.json');
    rows.push(...(delta.customers ?? []));
  }

  if (!rows.length) {
    throw new Error('No portal import files found (MASTER or DELTA).');
  }

  return { sources, rows };
}

const { sources, rows: importRows } = loadImportRows();
const diskFiles = new Set(fs.existsSync(docsDir) ? fs.readdirSync(docsDir) : []);

function docTypeToRecordKind(docType) {
  switch (docType) {
    case 'contract':
      return 'candid_contract';
    case 'invoice':
      return 'invoice';
    case 'proposal':
      return 'proposal';
    case 'loa':
      return 'external_contract';
    default:
      return 'other';
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDisplayDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pickPreviousProvider(rows) {
  for (const row of rows) {
    if (row.previous_provider) return row.previous_provider;
  }
  return null;
}

function pickFinancialSummary(rows) {
  let merged = {};
  for (const row of rows) {
    if (row.financial_summary) merged = { ...merged, ...row.financial_summary };
  }
  return merged;
}

function mapPreviousProvider(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.provider && !raw.name && Object.keys(raw).length === 0) return null;
  return {
    provider: raw.provider ?? raw.name ?? '',
    accountNum: raw.account_num ?? raw.account_number ?? '',
    lastInvoiceNum: raw.last_invoice_num ?? raw.invoice_num ?? raw.invoice_id ?? '',
    lastInvoiceDate: raw.last_invoice_date ?? raw.invoice_date ?? '',
    lastInvoiceAmount: raw.last_invoice_amount ?? raw.monthly_cost ?? raw.mrc ?? null,
    annualCost: raw.annual_cost ?? null,
    effectiveRate: raw.effective_rate ?? null,
    product: raw.product ?? '',
    note: raw.note ?? raw.notes ?? raw.note2 ?? '',
    users: raw.users ?? null,
    lines: raw.lines ?? null,
    breakdown: raw.breakdown ?? null,
    numbersPorted: raw.numbers_ported ?? null,
    portDate: raw.port_date ?? null,
  };
}

function mapNonCandidServices(rows) {
  return rows.flatMap((row) =>
    (row.non_candid_services ?? []).map((svc) => ({
      provider: svc.provider ?? '',
      product: svc.product ?? '',
      accountNum: svc.account_num ?? '',
      mrc: svc.mrc ?? null,
      isCandid: svc.is_candid ?? false,
      note: svc.note ?? '',
      lines: svc.lines ?? null,
    })),
  );
}

function mapDeal(d) {
  return {
    dealId: d.deal_id,
    dealUid: d.deal_uid ?? null,
    provider: d.provider,
    product: d.product,
    serviceDescription: d.service_description,
    paySource: d.pay_source,
    isCandid: d.is_candid,
    mrc: d.mrc,
    promoMrc: d.promo_mrc ?? null,
    annualBilling: d.annual_billing ?? false,
    yr1Annual: d.yr1_annual ?? null,
    yr2Annual: d.yr2_annual ?? null,
    contractSignDate: d.contract_sign_date ?? null,
    contractStartDate: d.contract_start_date,
    contractEndDate: d.contract_end_date,
    contractTermMonths: d.contract_term_months ?? null,
    alert60Days: d.alert_60_days,
    renewalNoticeDate: d.renewal_notice_date ?? null,
    status: d.status,
    salesOrderRef: d.sales_order_ref ?? '',
    salesOrderNum: d.sales_order_num ?? '',
    contactAtSigning: d.contact_at_signing ?? '',
    providerAccountNum: d.provider_account_num ?? '',
    agent: d.agent ?? '',
    commissionRate: d.commission_rate ?? null,
    commissionType: d.commission_type ?? '',
    equipmentNote: d.equipment_note ?? '',
    note: d.note ?? '',
    serviceBreakdown: d.service_breakdown ?? null,
    portingInfo: d.porting_info ?? null,
  };
}

/** Group import rows by BMW merchant (multiple folders may map to one merchant). */
const byMerchant = new Map();
for (const row of importRows) {
  const merchant = row.customer.bmw_merchant_name?.trim();
  if (!merchant) continue;
  const list = byMerchant.get(merchant) ?? [];
  list.push(row);
  byMerchant.set(merchant, list);
}

const merchants = {};
const documentsByCustomerId = {};
const allDocumentFilenames = new Set();
let totalDocuments = 0;
let documentsOnDisk = 0;

for (const [bmwMerchantName, rows] of byMerchant.entries()) {
  const primary = rows[0];
  const cust = primary.customer;

  const deals = rows.flatMap((r) => r.deals ?? []);
  const renewalAlerts = rows.flatMap((r) => r.renewal_alerts ?? []);
  const optimizations = rows.flatMap((r) =>
    (r.optimization_opportunities ?? []).map((o) => ({
      type: o.type ?? 'Opportunity',
      detail: o.detail ?? o.description ?? '',
      potentialImpact: o.potential_impact ?? o.potentialImpact ?? '',
    })),
  );
  const documents = rows.flatMap((r) => r.documents ?? []);
  const financial = pickFinancialSummary(rows);
  const previousProviderRaw = pickPreviousProvider(rows);
  const nonCandidServices = mapNonCandidServices(rows);

  const portalCustomerId = cust.customer_id;
  const docEntries = [];

  for (const doc of documents) {
    const filename = doc.filename;
    if (!filename) continue;
    const onDisk = diskFiles.has(filename);
    if (onDisk) {
      documentsOnDisk++;
      allDocumentFilenames.add(filename);
    }
    totalDocuments++;

    let size = '';
    if (onDisk) {
      const stat = fs.statSync(path.join(docsDir, filename));
      size = formatBytes(stat.size);
    }

    docEntries.push({
      id: doc.document_id ?? `doc-${filename}`,
      customerId: portalCustomerId,
      filename,
      recordKind: docTypeToRecordKind(doc.doc_type),
      provider: doc.provider ?? '',
      docSubtype: doc.doc_subtype ?? '',
      signedDate: doc.signed_date ?? null,
      signedBy: doc.signed_by ?? '',
      invoiceDate: doc.invoice_date ?? null,
      amount: doc.amount ?? null,
      roiNote: doc.roi_note ?? '',
      description: doc.description ?? '',
      onedrivePath: doc.onedrive_path ?? '',
      docLocation: doc.location ?? '',
      docStatus: doc.status ?? '',
      onDisk,
      uploadedBy: 'Portal import',
      date: formatDisplayDate(doc.signed_date || doc.invoice_date) || 'Imported',
      size: size || '—',
    });
  }

  documentsByCustomerId[portalCustomerId] = docEntries;

  const salesPitch = primary.portal_sales_pitch ?? rows.find((r) => r.portal_sales_pitch)?.portal_sales_pitch;

  merchants[bmwMerchantName] = {
    importCustomerId: portalCustomerId,
    bmwMerchantName,
    displayName: cust.display_name ?? cust.bmw_merchant_name,
    folderName: cust.folder_name ?? '',
    website: cust.website ?? '',
    description: cust.description ?? '',
    industry: cust.industry ?? '',
    address: cust.address ?? '',
    city: cust.city ?? '',
    state: cust.state ?? '',
    zip: cust.zip ?? '',
    phone: cust.phone ?? '',
    email: cust.email ?? '',
    primaryContact: cust.primary_contact ?? null,
    totalCandidMrc: financial.total_candid_mrc ?? 0,
    previousProviderMrc: financial.previous_provider_mrc ?? financial.previous_provider_mrc_voice ?? null,
    savingsVsPrevious: financial.savings_vs_previous ?? null,
    billingCycle: financial.billing_cycle ?? financial.billingCycle ?? '',
    financialNotes: financial.notes ?? '',
    previousProvider: mapPreviousProvider(previousProviderRaw),
    nonCandidServices,
    deals: deals.map(mapDeal),
    renewalAlerts: renewalAlerts.map((a) => ({
      provider: a.provider,
      renewalDate: a.renewal_date,
      alert60Days: a.alert_60_days,
      daysUntilRenewal: a.days_until_renewal,
      priority: a.priority ?? '',
      note: a.note ?? '',
      dealUid: a.deal_uid ?? null,
    })),
    optimizations,
    salesPitch: salesPitch
      ? {
          opening: salesPitch.opening ?? '',
          totalCandidMrc: salesPitch.total_candid_mrc ?? '',
        }
      : null,
    onedriveFolder: primary.onedrive_folder ?? '',
    importRowCount: rows.length,
  };
}

const payload = {
  generatedAt: new Date().toISOString(),
  sourceFiles: sources,
  stats: {
    merchants: Object.keys(merchants).length,
    importRows: importRows.length,
    totalDocuments,
    documentsOnDisk,
  },
  merchants,
  documentsByCustomerId,
  documentFilenames: [...allDocumentFilenames],
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`Wrote ${outPath}`);
console.log(payload.stats);
