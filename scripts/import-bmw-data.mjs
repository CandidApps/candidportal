#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'src/data/bmw');

function clean(v) {
  if (v == null) return '';
  return String(v).trim();
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function importDeals() {
  const wb = XLSX.readFile(path.join(root, 'BMW_Deal_Master_Table.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  return rows.map((row, idx) => ({
    rowNum: idx + 1,
    paySource: clean(row['Pay Source']),
    dealUid: clean(row.Deal_UID),
    agentCommId: clean(row.Agent_Comm_ID),
    merchant: clean(row.Merchant),
    provider: clean(row.Provider),
    product: clean(row.Product),
    providerAccount: clean(row['Provider Account #']),
    uidHeader: clean(row['UID Header']),
    sandlerDealId: clean(row.SandlerDealID),
    serviceDescription: clean(row['Service Description']),
    rate: num(row.Rate),
    contractMrc: num(row['Contract MRC']),
    activeDeal: clean(row['Active Deal']).toLowerCase() === 'yes',
    status: clean(row.Status),
    street: clean(row['Street Address']),
    city: clean(row.City),
    state: clean(row.State),
    zip: clean(row['ZIP Code']) || clean(row.Zip),
    agentName: clean(row.Agent_Name) || clean(row.Agent),
    customerId: clean(row['Customer ID']),
    customerContactName: clean(row['Customer Contact Name']),
    agentId: clean(row['Agent ID']),
    serviceId: clean(row['Service ID']),
    uuid: clean(row.UUID),
    cloverId: clean(row.CloverID),
  })).filter((d) => d.dealUid || d.merchant);
}

function importAgentRates() {
  const wb = XLSX.readFile(path.join(root, 'BMW_Agent_Com_Rates.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  return rows.map((row, idx) => ({
    rowNum: idx + 1,
    email: clean(row.Email),
    name: clean(row.Name),
    id: clean(row.ID),
    commissionRate: num(row['Commission Rate']) ?? 0,
    overridePartner: clean(row['Override Partner']),
    overrideRate: num(row['Override Rate']),
    tempRate: num(row['Temp Rate']),
    tempRateEndDate: clean(row['Temp Rate End Date']),
    tempRateDetermine: clean(row['Temp Rate Determine']),
  })).filter((r) => r.id);
}

fs.mkdirSync(outDir, { recursive: true });

const deals = importDeals();
const agentRates = importAgentRates();

fs.writeFileSync(path.join(outDir, 'deals.json'), JSON.stringify(deals, null, 2));
fs.writeFileSync(path.join(outDir, 'agent-rates.json'), JSON.stringify(agentRates, null, 2));

console.log(`Wrote ${deals.length} deals and ${agentRates.length} agent rate profiles to ${outDir}`);
