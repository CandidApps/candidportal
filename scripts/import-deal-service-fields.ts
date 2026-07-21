/**
 * Apply Base Service / Service Detail (and optional service_type_id) from
 * Deal_Service_Fields_Payments_Standardized-1.xlsx into deals.contract_data.
 *
 * Usage: npx tsx scripts/import-deal-service-fields.ts [--dry-run] [path-to-xlsx]
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  buildAllCustomerContracts,
  mergeCustomerContractsForDisplay,
} from '../src/lib/customer-contracts-from-deals';
import type { CandidContractRecord } from '../src/lib/customer-records';
import { loadCrmFromDatabase } from '../src/lib/crm/load-from-db';
import { updateCustomerDeal } from '../src/lib/crm/persist';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArg = args.find((a) => !a.startsWith('--'));
const xlsxPath = path.resolve(
  process.cwd(),
  fileArg ?? 'Deal_Service_Fields_Payments_Standardized-1.xlsx',
);

type SheetRow = Record<string, string>;

function cell(row: SheetRow, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

const workbook = XLSX.read(readFileSync(xlsxPath), { type: 'buffer' });
const sheetName = workbook.SheetNames.includes('Deals') ? 'Deals' : workbook.SheetNames[0]!;
const sheetRows = XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName]!, {
  defval: '',
});

const data = await loadCrmFromDatabase();
if (!data) {
  throw new Error('Could not load CRM data from database.');
}

const contractsByCustomer = mergeCustomerContractsForDisplay(
  data.contractsByCustomerId,
  buildAllCustomerContracts(data.customers),
);

const contractById = new Map<string, { customerId: string; contract: CandidContractRecord }>();
const contractByAccountDeal = new Map<string, { customerId: string; contract: CandidContractRecord }>();
for (const [customerId, contracts] of Object.entries(contractsByCustomer)) {
  for (const contract of contracts) {
    contractById.set(contract.id, { customerId, contract });
    const dealId = contract.dealId?.trim();
    if (dealId) contractByAccountDeal.set(`${customerId}::${dealId}`, { customerId, contract });
  }
}

let updated = 0;
let skipped = 0;
let unchanged = 0;
const missing: string[] = [];

for (const row of sheetRows) {
  const contractId = cell(row, 'contract_id', 'Contract ID', 'Deal ID');
  const accountId = cell(row, 'account_id', 'Account ID');
  const dealUid = cell(row, 'deal_id', 'Deal UID', 'deal_uid');
  if (!contractId && !(accountId && dealUid)) continue;

  const baseService = cell(row, 'Base Service', 'base_service');
  const serviceDetail = cell(row, 'Service Detail', 'Service Details', 'service_detail');
  const serviceTypeId = cell(row, 'service_type_id', 'Service Type ID');

  if (!baseService && !serviceDetail && !serviceTypeId) {
    skipped += 1;
    continue;
  }

  let hit =
    (contractId ? contractById.get(contractId) : undefined) ??
    (accountId && dealUid ? contractByAccountDeal.get(`${accountId}::${dealUid}`) : undefined);
  if (!hit) {
    missing.push(contractId || `${accountId}::${dealUid}`);
    continue;
  }

  const { customerId, contract } = hit;
  const next: CandidContractRecord = { ...contract };
  let changed = false;

  if (baseService && next.baseService !== baseService) {
    next.baseService = baseService;
    changed = true;
  }
  if (serviceDetail && next.serviceDetail !== serviceDetail) {
    next.serviceDetail = serviceDetail;
    changed = true;
  }
  if (serviceTypeId && next.serviceTypeId !== serviceTypeId) {
    next.serviceTypeId = serviceTypeId;
    changed = true;
  }

  if (!changed) {
    unchanged += 1;
    continue;
  }

  if (dryRun) {
    updated += 1;
    continue;
  }

  await updateCustomerDeal(customerId, next);
  updated += 1;
}

console.log(`Sheet: ${sheetName} (${sheetRows.length} rows)`);
console.log(`File: ${xlsxPath}`);
console.log(dryRun ? 'DRY RUN — no database writes' : 'Applied updates to database');
console.log(`Updated: ${updated}`);
console.log(`Unchanged (already matched): ${unchanged}`);
console.log(`Skipped (no base/detail/type in row): ${skipped}`);
console.log(`Missing contract_id in CRM: ${missing.length}`);
if (missing.length && missing.length <= 15) {
  console.log(missing.join('\n'));
} else if (missing.length) {
  console.log(missing.slice(0, 10).join('\n'));
  console.log(`… and ${missing.length - 10} more`);
}
