import { readFileSync } from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { loadCrmFromDatabase } from '../src/lib/crm/load-from-db';
import {
  contractCountsAsActiveService,
  contractServiceLabels,
  serviceLabelsForCustomer,
} from '../src/components/customers/accounts-list-utils';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const data = await loadCrmFromDatabase();
if (!data) {
  throw new Error('Could not load CRM data from database.');
}

const companyById = new Map(data.customers.map((c) => [c.id, c.company]));
const serviceSummary = new Map<string, { service: string; account_count: number; contract_mentions: number }>();
const accountRows: { company: string; account_id: string; service: string }[] = [];

for (const customer of data.customers) {
  const contracts = data.contractsByCustomerId[customer.id] ?? [];
  const labels = serviceLabelsForCustomer(contracts);
  const mentionCounts = new Map<string, number>();

  for (const contract of contracts) {
    if (!contractCountsAsActiveService(contract)) continue;
    for (const label of contractServiceLabels(contract)) {
      const key = label.toLowerCase();
      mentionCounts.set(key, (mentionCounts.get(key) ?? 0) + 1);
    }
  }

  for (const label of labels) {
    const key = label.toLowerCase();
    const mentions = mentionCounts.get(key) ?? 1;
    const row = serviceSummary.get(key);
    if (row) {
      row.account_count += 1;
      row.contract_mentions += mentions;
    } else {
      serviceSummary.set(key, { service: label, account_count: 1, contract_mentions: mentions });
    }

    accountRows.push({
      company: customer.company,
      account_id: customer.id,
      service: label,
    });
  }
}

const servicesSheet = [...serviceSummary.values()].sort(
  (a, b) => b.account_count - a.account_count || a.service.localeCompare(b.service),
);
accountRows.sort((a, b) => a.company.localeCompare(b.company) || a.service.localeCompare(b.service));

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  workbook,
  XLSX.utils.json_to_sheet(servicesSheet),
  'Services',
);
XLSX.utils.book_append_sheet(
  workbook,
  XLSX.utils.json_to_sheet(accountRows),
  'Account Services',
);

const outPath = path.join(process.cwd(), 'Account_Contract_Services.xlsx');
XLSX.writeFile(workbook, outPath);

console.log(`Wrote ${outPath}`);
console.log(`Services: ${servicesSheet.length}`);
console.log(`Account-service rows: ${accountRows.length}`);
