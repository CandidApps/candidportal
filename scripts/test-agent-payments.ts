import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setCrmRuntimeData } from '../src/lib/crm/runtime-store';
import { matchDealToCommissionRow } from '../src/lib/bmw/commission-match';
import { commissionRowAmountForBatch } from '../src/lib/commissions/supplier-config';
import { buildAgentCommissionRowsFromImports } from '../src/lib/commissions/agent-commission-engine';
import { agentCommIdForDeal } from '../src/lib/bmw/agent-comm-history';
import { invalidateDealIndexes } from '../src/lib/bmw/deal-master';
import type { SupplierId } from '../src/lib/commissions/supplier-config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: dealRows } = await sb.from('bmw_deals').select('deal_data');
const { data: rateRows } = await sb.from('bmw_agent_rates').select('agent_comm_id, rate_data');

setCrmRuntimeData({
  bmwDeals: dealRows?.map((r) => r.deal_data) ?? [],
  agentRates: rateRows?.map((r) => ({ id: r.agent_comm_id, ...r.rate_data })) ?? [],
  customers: [],
  documentsByCustomerId: {},
  contractsByCustomerId: {},
  source: 'supabase',
  ready: true,
});

invalidateDealIndexes();

const appdirectRow = {
  Customer: 'AgriVision Farm Management',
  'Account Number': 'b2a9a77b-e70a-46b0-b64f-808e8eb0234e',
  'Commission Cycle': 'Apr 30, 2026',
  'Comp Paid': 18.78,
};

const telarusRow = {
  order_id: '552988',
  customer: 'AgriVision Farm Management',
  total_commission: 62.7,
};

const appdirectBatch = {
  id: 'manual-appdirect-2026-07',
  supplier: 'appdirect' as SupplierId,
  period: '2026-07',
  amountField: 'Comp Paid',
  totalAmount: 581.53,
  rowCount: 14,
  importedAt: new Date().toISOString(),
  rows: [appdirectRow],
};

const telarusBatch = {
  id: 'manual-telarus-2026-07',
  supplier: 'telarus' as SupplierId,
  period: '2026-07',
  amountField: 'total_commission',
  totalAmount: 62.7,
  rowCount: 1,
  importedAt: new Date().toISOString(),
  rows: [telarusRow],
};

for (const [label, supplier, row, batch] of [
  ['AppDirect', 'appdirect', appdirectRow, appdirectBatch],
  ['Telarus', 'telarus', telarusRow, telarusBatch],
] as const) {
  const deal = matchDealToCommissionRow(supplier, row);
  const amt = commissionRowAmountForBatch(batch, row);
  const agentId = deal ? agentCommIdForDeal(deal, '2026-07') : '';
  console.log(`\n${label}:`);
  console.log('  deal match:', deal?.dealUid, deal?.agentCommId);
  console.log('  amount:', amt);
  console.log('  agentCommIdForDeal:', agentId);
}

const agents = buildAgentCommissionRowsFromImports([appdirectBatch, telarusBatch], '2026-07');
console.log('\nAgent rows:', agents.length);
for (const a of agents) {
  console.log(`  ${a.company}: $${a.currentMonthOwed} (${a.customers.length} lines)`);
}
