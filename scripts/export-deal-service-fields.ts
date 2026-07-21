import { readFileSync } from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  buildAllCustomerContracts,
  contractServiceTitle,
  mergeCustomerContractsForDisplay,
} from '../src/lib/customer-contracts-from-deals';
import { contractServiceTypeLabel } from '../src/lib/crm/contract-service-pricing';
import { loadCrmFromDatabase } from '../src/lib/crm/load-from-db';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const data = await loadCrmFromDatabase();
if (!data) {
  throw new Error('Could not load CRM data from database.');
}

const contractsByCustomer = mergeCustomerContractsForDisplay(
  data.contractsByCustomerId,
  buildAllCustomerContracts(data.customers),
);

type DealExportRow = {
  company: string;
  account_id: string;
  contract_id: string;
  deal_id: string;
  deal_status: string;
  provider: string;
  pay_source: string;
  service_type_id: string;
  service_type: string;
  'Base Service': string;
  'Service Detail': string;
  product: string;
  service: string;
  Description: string;
  contract_title: string;
  monthly_mrc: number | '';
  contract_start_date: string;
  contract_end_date: string;
  'Fill Notes': string;
};

const rows: DealExportRow[] = [];

for (const customer of data.customers) {
  const contracts = contractsByCustomer[customer.id] ?? [];
  for (const contract of contracts) {
    const monthly = contract.mrc ?? contract.monthly;
    rows.push({
      company: customer.company,
      account_id: customer.id,
      contract_id: contract.id,
      deal_id: contract.dealId ?? '',
      deal_status: contract.dealStatus,
      provider: contract.solution?.trim() || contract.vendor?.trim() || '',
      pay_source: contract.paySource?.trim() || '',
      service_type_id: contract.serviceTypeId?.trim() || '',
      service_type: contractServiceTypeLabel(contract.serviceTypeId) || '',
      'Base Service': contract.baseService?.trim() || '',
      'Service Detail': contract.serviceDetail?.trim() || '',
      product: contract.product?.trim() || '',
      service: contract.service?.trim() || '',
      Description: contract.solutionDescription?.trim() || '',
      contract_title: contractServiceTitle(contract),
      monthly_mrc: Number.isFinite(monthly) && monthly > 0 ? monthly : '',
      contract_start_date: contract.contractStartDate ?? '',
      contract_end_date: contract.contractEndDate ?? '',
      'Fill Notes': '',
    });
  }
}

rows.sort((a, b) => a.company.localeCompare(b.company) || a.contract_title.localeCompare(b.contract_title));

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Deals');

const outPath = path.join(process.cwd(), 'Deal_Service_Fields.xlsx');
XLSX.writeFile(workbook, outPath);

console.log(`Wrote ${outPath}`);
console.log(`Deals exported: ${rows.length}`);
