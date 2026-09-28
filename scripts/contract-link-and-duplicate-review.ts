/**
 * Review workbook: proposed contract-document → deal links (one tab, Confidence level column)
 * plus likely duplicate deals.
 *
 *   npx tsx scripts/contract-link-and-duplicate-review.ts [outPath]
 */
import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import { findLikelyDuplicatePairs, type DuplicateCandidate } from '../src/lib/crm/contract-duplicates';
import { createSupabaseAdminClient } from '../src/lib/supabase/admin';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i < 0) continue;
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const OUT = process.argv[2] || path.join(os.homedir(), 'Downloads', 'Contract-Document-Link-Review.xlsx');

type CustomerRow = { id: string; company: string | null; external_id: string | null };
type DealRow = {
  id: string;
  customer_id: string;
  external_id: string | null;
  deal_uid: string | null;
  provider: string | null;
  product: string | null;
  pay_source: string | null;
  deal_status: string | null;
  monthly_cost: number | null;
  location_external_id: string | null;
  contract_start_date: string | null;
  contract_data: Record<string, unknown> | null;
};
type DocRow = {
  id: string;
  customer_id: string;
  external_id: string | null;
  record_kind: string | null;
  filename: string | null;
  provider: string | null;
  doc_subtype: string | null;
  storage_path: string | null;
  deal_id: string | null;
  document_data: Record<string, unknown> | null;
};

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const supabase = createSupabaseAdminClient();
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

const STOP = new Set([
  'the', 'and', 'for', 'inc', 'llc', 'ltd', 'corp', 'with', 'from', 'business', 'services', 'service',
  'solutions', 'solution', 'communications', 'cloud', 'internet', 'phone', 'voice', 'merchant',
  'processing', 'payment', 'payments', 'appdirect', 'marketplace', 'microsoft', 'nce', 'plan',
  'standard', 'premium', 'pro', 'basic', 'annual', 'months', 'month', 'year', 'ucaas', 'managed',
  'order', 'form', 'signed', 'quote', 'agreement', 'contract', 'invoice', 'receipt', 'sales',
  'candid', 'pdf', 'docx', 'xlsx', 'doc', 'com', 'www', 'http', 'https', 'null', 'undefined',
]);

const ALIASES: Record<string, string[]> = {
  vonage: ['vonage', 'vbc'],
  dialpad: ['dialpad'],
  goto: ['goto', 'gotoconnect', 'jive'],
  comcast: ['comcast', 'xfinity'],
  spectrum: ['spectrum', 'charter'],
  lumen: ['lumen', 'centurylink', 'level3'],
  att: ['att', 'atandt'],
  verizon: ['verizon', 'vge'],
  ringcentral: ['ringcentral', 'rc'],
  nextiva: ['nextiva'],
  nuvei: ['nuvei', 'paycenter', 'hyfin'],
  checkcommerce: ['checkcommerce', 'check commerce'],
  vendara: ['vendara'],
  clover: ['clover', 'cardpointe', 'cardconnect', 'fiserv'],
  payjunction: ['payjunction'],
  linked2pay: ['linked2pay', 'linked 2 pay'],
  weave: ['weave'],
  mango: ['mango'],
  nhc: ['nhc', 'new horizon', 'newhorizon'],
  spectrotel: ['spectrotel'],
  windstream: ['windstream'],
  airespring: ['airespring'],
  mettel: ['mettel'],
  net2phone: ['net2phone'],
  intelisys: ['intelisys'],
  sandler: ['sandler'],
  adobe: ['adobe', 'acrobat'],
  google: ['google workspace', 'gsuite', 'workspace'],
  corpIT: ['corpit'],
  goexceed: ['goexceed', 'mobilx', 'mobil(x)'],
  tmobile: ['t-mobile', 'tmobile'],
  zentility: ['zentility', 'freepoint'],
  teksystems: ['teksystems', 'tek systems'],
};

function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s: unknown): string[] {
  return norm(s)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

function providerAliases(text: string): Set<string> {
  const n = norm(text);
  const hits = new Set<string>();
  for (const [canon, list] of Object.entries(ALIASES)) {
    if (list.some((a) => n.includes(a))) hits.add(canon);
  }
  const first = tokens(text)[0];
  if (first && first.length >= 4) hits.add(first);
  return hits;
}

function kindScore(kind: string | null): number {
  if (kind === 'candid_contract') return 40;
  if (kind === 'external_contract') return 35;
  if (kind === 'proposal') return 20;
  if (kind === 'other') return 8;
  if (kind === 'invoice' || kind === 'statement' || kind === 'statement_for_analysis') return 2;
  return 5;
}

const INVOICE_KINDS = new Set(['invoice', 'statement', 'statement_for_analysis']);

type Confidence = 'High' | 'Medium' | 'Low';

async function main() {
  const [customers, allDeals, allDocs] = await Promise.all([
    fetchAll<CustomerRow & { archived_at: string | null }>('customers', 'id, company, external_id, archived_at'),
    fetchAll<DealRow>(
      'deals',
      'id, customer_id, external_id, deal_uid, provider, product, pay_source, deal_status, monthly_cost, location_external_id, contract_start_date, contract_data',
    ),
    fetchAll<DocRow>(
      'customer_records',
      'id, customer_id, external_id, record_kind, filename, provider, doc_subtype, storage_path, deal_id, document_data',
    ),
  ]);

  const customerById = new Map(customers.filter((c) => !c.archived_at).map((c) => [c.id, c]));
  const deals = allDeals.filter((d) => customerById.has(d.customer_id));
  const activeDeals = deals.filter((d) => String(d.deal_status ?? 'active').toLowerCase() === 'active');
  const docs = allDocs.filter((d) => customerById.has(d.customer_id));
  const company = (customerId: string) => customerById.get(customerId)?.company ?? '';
  const customerExt = (customerId: string) => customerById.get(customerId)?.external_id ?? '';
  const docContractId = (d: DocRow) => String(d.document_data?.contractId ?? '').trim();
  const isLinked = (d: DocRow) => Boolean(docContractId(d) || d.deal_id);

  const dealsByCustomer = new Map<string, DealRow[]>();
  for (const d of activeDeals) {
    const list = dealsByCustomer.get(d.customer_id) ?? [];
    list.push(d);
    dealsByCustomer.set(d.customer_id, list);
  }

  const already: Record<string, unknown>[] = [];
  const proposals: (Record<string, unknown> & { 'Confidence level': Confidence; Score: number; _dealExt: string })[] = [];
  const unmatched: Record<string, unknown>[] = [];

  for (const doc of docs) {
    const base = {
      Company: company(doc.customer_id),
      Filename: doc.filename ?? '',
      'Record kind': doc.record_kind ?? '',
      'Doc provider': doc.provider ?? '',
      'Has file': doc.storage_path ? 'Yes' : 'No',
    };
    if (isLinked(doc)) {
      already.push({ ...base, 'Linked contract id': docContractId(doc) || doc.deal_id || '' });
      continue;
    }
    const custDeals = dealsByCustomer.get(doc.customer_id) ?? [];
    if (!custDeals.length) {
      unmatched.push({
        ...base,
        Reason: 'No active deals on customer',
        'Record external id': doc.external_id ?? '',
        'Customer external id': customerExt(doc.customer_id),
      });
      continue;
    }

    const docText = `${doc.provider ?? ''} ${doc.filename ?? ''} ${doc.doc_subtype ?? ''}`;
    const docAliases = providerAliases(docText);
    const docTokens = new Set(tokens(docText));
    const fname = norm(doc.filename);
    const fnameCompact = fname.replace(/\s+/g, '');

    const scored = custDeals
      .map((deal) => {
        const dealText = `${deal.provider ?? ''} ${deal.product ?? ''} ${deal.pay_source ?? ''}`;
        const dealAliases = providerAliases(dealText);
        const reasons: string[] = [];
        let score = kindScore(doc.record_kind);
        const uid = norm(deal.deal_uid).replace(/\s+/g, '');
        if (uid && uid.length >= 4 && fnameCompact.includes(uid)) {
          score += 100;
          reasons.push('deal_uid_in_filename');
        }
        let aliasHits = 0;
        for (const a of docAliases) {
          if (dealAliases.has(a)) {
            aliasHits++;
            reasons.push(`alias:${a}`);
          }
        }
        score += aliasHits * 35;
        let tokHits = 0;
        for (const t of tokens(dealText)) {
          if (t.length < 4) continue;
          if (docTokens.has(t) || fname.includes(t)) {
            tokHits++;
            reasons.push(`token:${t}`);
          }
        }
        score += Math.min(tokHits, 4) * 12;
        const pay = norm(deal.pay_source);
        if (pay && (fname.includes(pay) || norm(doc.provider).includes(pay))) {
          score += 15;
          reasons.push('pay_source_match');
        }
        if (INVOICE_KINDS.has(doc.record_kind ?? '')) score -= 15;
        return { deal, score, reasons: [...new Set(reasons)] };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0]!;
    const second = scored[1];
    const margin = second ? best.score - second.score : best.score;
    const hasSignal = best.reasons.some(
      (r) => r.startsWith('alias:') || r.startsWith('token:') || r === 'deal_uid_in_filename' || r === 'pay_source_match',
    );

    if (!hasSignal || best.score < 45) {
      unmatched.push({
        ...base,
        Reason: !hasSignal ? 'No provider/filename signal vs deals' : `Best score too low (${best.score})`,
        'Best deal': best.deal.provider ?? '',
        'Best score': best.score,
        'Deals on customer': custDeals.length,
        'Record external id': doc.external_id ?? '',
        'Customer external id': customerExt(doc.customer_id),
      });
      continue;
    }

    const near = (delta: number) => scored.filter((s) => s.score >= best.score - delta).length;
    const hasAlias = best.reasons.some((r) => r.startsWith('alias:'));
    let confidence: Confidence;
    if (
      ((best.reasons.includes('deal_uid_in_filename') || hasAlias) && margin >= 20 && best.score >= 70) ||
      (hasAlias && margin >= 25 && best.score >= 60 && near(10) === 1)
    ) {
      confidence = 'High';
    } else if (best.score >= 55 && margin >= 10) {
      confidence = 'Medium';
    } else {
      confidence = 'Low';
    }
    if (
      confidence === 'Medium' &&
      (doc.record_kind === 'candid_contract' || doc.record_kind === 'external_contract') &&
      margin >= 20 &&
      near(5) === 1
    ) {
      confidence = 'High';
    }
    if (INVOICE_KINDS.has(doc.record_kind ?? '') && !best.reasons.includes('deal_uid_in_filename') && confidence === 'High') {
      confidence = 'Medium';
    }

    proposals.push({
      'Confidence level': confidence,
      Approve: confidence === 'High' ? 'YES' : '',
      ...base,
      'Proposed deal provider': best.deal.provider ?? '',
      'Proposed deal product': best.deal.product ?? '',
      'Proposed deal pay source': best.deal.pay_source ?? '',
      'Proposed deal UID': best.deal.deal_uid ?? '',
      'Proposed deal external id': best.deal.external_id ?? '',
      Score: best.score,
      Margin: margin,
      Reasons: best.reasons.join(', '),
      'Top candidates': scored
        .slice(0, 3)
        .map((s) => `${s.score}: ${(s.deal.provider ?? '').slice(0, 40)}`)
        .join(' | '),
      'Record external id': doc.external_id ?? '',
      'Customer external id': customerExt(doc.customer_id),
      _dealExt: best.deal.external_id ?? '',
    });
  }

  const order: Record<Confidence, number> = { High: 0, Medium: 1, Low: 2 };
  proposals.sort(
    (a, b) =>
      order[a['Confidence level']] - order[b['Confidence level']] ||
      b.Score - a.Score ||
      String(a.Company).localeCompare(String(b.Company)),
  );

  const linkedDealIds = new Set(docs.map(docContractId).filter(Boolean));
  for (const d of docs) if (d.deal_id) linkedDealIds.add(d.deal_id);
  const proposedDealIds = new Set(proposals.map((p) => p._dealExt));
  const dealsNoMatch = activeDeals
    .filter((d) => !linkedDealIds.has(d.external_id ?? '') && !linkedDealIds.has(d.id) && !proposedDealIds.has(d.external_id ?? ''))
    .map((d) => ({
      Company: company(d.customer_id),
      Provider: d.provider ?? '',
      Product: d.product ?? '',
      'Pay source': d.pay_source ?? '',
      'Deal UID': d.deal_uid ?? '',
      'Deal external id': d.external_id ?? '',
    }))
    .sort((a, b) => a.Company.localeCompare(b.Company));

  const candidates: (DuplicateCandidate & { deal: DealRow })[] = deals.map((d) => ({
    id: d.id,
    customerId: d.customer_id,
    company: company(d.customer_id),
    provider: d.provider ?? '',
    product: d.product,
    paySource: d.pay_source,
    monthly: d.monthly_cost,
    dealUid: d.deal_uid,
    status: d.deal_status,
    service: typeof d.contract_data?.service === 'string' ? (d.contract_data.service as string) : null,
    locationId: d.location_external_id,
    deal: d,
  }));
  const pairs = findLikelyDuplicatePairs(candidates, { crossAccount: true, minScore: 55 });
  const duplicates = pairs.map((p) => ({
    'Confidence level': p.confidence,
    Score: p.score,
    'Cross account': p.crossAccount ? 'Yes' : 'No',
    'Company A': p.a.company,
    'Company B': p.b.company,
    'Provider A': p.a.deal.provider ?? '',
    'Provider B': p.b.deal.provider ?? '',
    'Product A': p.a.deal.product ?? '',
    'Product B': p.b.deal.product ?? '',
    'Pay source A': p.a.deal.pay_source ?? '',
    'Pay source B': p.b.deal.pay_source ?? '',
    'Monthly A': p.a.deal.monthly_cost ?? '',
    'Monthly B': p.b.deal.monthly_cost ?? '',
    'Status A': p.a.deal.deal_status ?? '',
    'Status B': p.b.deal.deal_status ?? '',
    'Deal UID A': p.a.deal.deal_uid ?? '',
    'Deal UID B': p.b.deal.deal_uid ?? '',
    'Location A': p.a.deal.location_external_id ?? '',
    'Location B': p.b.deal.location_external_id ?? '',
    'Deal external id A': p.a.deal.external_id ?? '',
    'Deal external id B': p.b.deal.external_id ?? '',
    Reasons: p.reasons.join('; '),
  }));

  const count = (c: Confidence) => proposals.filter((p) => p['Confidence level'] === c).length;
  const dupCount = (c: Confidence) => duplicates.filter((p) => p['Confidence level'] === c).length;
  const summary: [string, string | number][] = [
    ['Generated', new Date().toISOString()],
    ['Active deals', activeDeals.length],
    ['Documents', docs.length],
    ['Documents already linked', already.length],
    ['Proposed links', proposals.length],
    ['  High', count('High')],
    ['  Medium', count('Medium')],
    ['  Low', count('Low')],
    ['Unmatched documents', unmatched.length],
    ['Active deals with no linked or proposed document', dealsNoMatch.length],
    ['Likely duplicate deal pairs', duplicates.length],
    ['  High', dupCount('High')],
    ['  Medium', dupCount('Medium')],
    ['  Cross-account pairs', duplicates.filter((d) => d['Cross account'] === 'Yes').length],
  ];

  const sheet = (rows: Record<string, unknown>[]) => {
    if (!rows.length) return XLSX.utils.aoa_to_sheet([['(none)']]);
    const headers = Object.keys(rows[0]!).filter((h) => !h.startsWith('_'));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))]);
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
    ws['!cols'] = headers.map((h) => ({ wch: Math.min(48, Math.max(12, h.length + 2)) }));
    return ws;
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Field', 'Value'],
      ...summary,
      [],
      ['How to use', ''],
      ['1', '"Proposed links": filter by Confidence level. Approve is prefilled YES for High; set YES/NO on the rest.'],
      ['2', '"Likely duplicate deals": same provider on the same account (or same company name on two accounts). Merge from Accounts → View by Contracts → Likely duplicates only.'],
      ['3', 'Unmatched documents need a manual deal assignment or can stay on the account unlinked.'],
      ['4', 'Nothing in this workbook has been applied.'],
      [],
      ['Link rules', 'Same customer only; provider aliases; filename tokens; deal UID in filename; contracts preferred over invoices.'],
      ['Duplicate rules', 'Same provider (base name); boosted by same deal ID, supplier-imported + manually created pair, same product/service/location/amount; reduced by different supplier deal numbers, products, locations, amounts, pay sources, or one deal expired.'],
    ]),
    'Summary',
  );
  XLSX.utils.book_append_sheet(wb, sheet(proposals), 'Proposed links');
  XLSX.utils.book_append_sheet(wb, sheet(duplicates), 'Likely duplicate deals');
  XLSX.utils.book_append_sheet(wb, sheet(unmatched), 'Unmatched documents');
  XLSX.utils.book_append_sheet(wb, sheet(dealsNoMatch), 'Deals with no match');
  XLSX.utils.book_append_sheet(wb, sheet(already), 'Already linked');
  XLSX.writeFile(wb, OUT);

  console.log(Object.fromEntries(summary));
  console.log('Wrote', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
