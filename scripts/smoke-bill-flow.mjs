/**
 * Quick smoke test for bill analysis flow (B–E) without browser auth.
 * Run: node scripts/smoke-bill-flow.mjs
 */
import { createRequire } from 'node:module';
import { rmSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');

// Mock browser localStorage for local-* modules
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = globalThis;

process.env.NEXT_PUBLIC_DATA_PERSISTENCE = 'local';

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function loadTs(relativePath) {
  const full = path.join(root, relativePath.replace(/^\//, ''));
  // Use Next/ts compiled output is hard; use dynamic import on .ts via tsx if available
  return import(pathToFileURL(full).href);
}

async function main() {
  console.log('Smoke test: bill analysis flow (local persistence)\n');

  // 1. Dev server
  try {
    const res = await fetch('http://localhost:3000/');
    if (res.ok || res.status === 307) pass('Dev server', `HTTP ${res.status}`);
    else fail('Dev server', `HTTP ${res.status}`);
  } catch (e) {
    fail('Dev server', e instanceof Error ? e.message : String(e));
  }

  // 2. API auth guards (expect 401)
  for (const [label, url] of [
    ['Admin leads API', 'http://localhost:3000/api/admin/leads'],
    ['Portal message center API', 'http://localhost:3000/api/portal/message-center'],
  ]) {
    try {
      const res = await fetch(url);
      if (res.status === 401) pass(label, '401 without session (expected)');
      else fail(label, `unexpected HTTP ${res.status}`);
    } catch (e) {
      fail(label, e instanceof Error ? e.message : String(e));
    }
  }

  // 3. Pure module tests via tsx
  const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const { execFileSync } = await import('node:child_process');
  const inline = `
    import { buildBillParseLineItems, buildBillParseFlags } from '../src/lib/bill-parse-display.ts';
    import { dedupePhoneLines, formatPortingAdminNote } from '../src/lib/bill-parse-phones.ts';
    import { buildLeadFromBillReview } from '../src/lib/services/portal-leads.ts';
    import { buildConfirmAdminNotes } from '../src/lib/bill-analysis-confirm.ts';

    const parseResult = {
      category: 'ucaas',
      categoryLabel: 'UCaaS / Phone',
      confidence: 'high',
      vendorName: 'RingCentral',
      monthlyAmount: 499,
      ucaasPhoneLines: [
        { number: '(555) 111-2222', isPrimary: true },
        { number: '(555) 111-2223' },
      ],
    };
    const items = buildBillParseLineItems(parseResult, 'RingCentral');
    if (items.length < 3) throw new Error('line items too few: ' + items.length);
    const phones = dedupePhoneLines(parseResult.ucaasPhoneLines);
    if (phones.length !== 2) throw new Error('phone dedupe failed');
    const review = {
      id: 'smoke-review-1',
      user_id: 'smoke-user',
      account_service_id: 'svc-1',
      customer_email: 'smoke@test.com',
      customer_name: 'Smoke Tester',
      vendor_name: 'RingCentral',
      filename: 'bill.pdf',
      bill_storage_path: 'x',
      detected_category: 'ucaas',
      category_label: 'UCaaS / Phone',
      detected_categories: ['ucaas'],
      parse_result: parseResult,
      draft_snapshot: null,
      published_snapshot: null,
      matched_provider_slug: null,
      status: 'pending_review',
      admin_notes: null,
      submitted_at: null,
      submitted_by: null,
      customer_notified_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const lead = buildLeadFromBillReview(review, { companyName: 'Smoke Co' });
    if (!lead.helpWith?.includes('RingCentral')) throw new Error('lead missing vendor');
    const notes = buildConfirmAdminNotes(
      { notes: 'test note', porting: { portAll: true, selectedNumbers: ['(555) 111-2222'] } },
      phones,
      new Date().toISOString(),
    );
    if (!notes.includes('Customer porting')) throw new Error('admin notes missing porting');
    console.log('MODULE_OK');
  `;
  try {
    const out = execFileSync(process.execPath, [tsx, '--eval', inline], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NEXT_PUBLIC_DATA_PERSISTENCE: 'local' },
    });
    if (out.includes('MODULE_OK')) pass('Parse/display/lead/confirm modules');
    else fail('Parse/display/lead/confirm modules', out.trim());
  } catch (e) {
    fail('Parse/display/lead/confirm modules', e.stderr?.toString() || e.message);
  }

  // 4. Local persistence integration via tsx
  const integration = `
    process.env.NEXT_PUBLIC_DATA_PERSISTENCE = 'local';
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    globalThis.window = globalThis;

    import { createLocalAnalysisReview } from '../src/lib/persistence/local-analysis-review.ts';
    import { submitLocalBillAnalysisConfirmation } from '../src/lib/persistence/local-analysis-review.ts';
    import { listLocalPortalLeads } from '../src/lib/persistence/local-portal-leads.ts';
    import { listLocalCustomerThreads, listLocalCustomerMessages } from '../src/lib/persistence/local-message-center.ts';
    import { createPortalLeadForBillReview } from '../src/lib/services/portal-leads.ts';

    const parseResult = {
      category: 'ucaas',
      categoryLabel: 'UCaaS / Phone',
      confidence: 'high',
      vendorName: 'Vonage',
    };
    const review = createLocalAnalysisReview({
      userId: 'user-smoke',
      accountServiceId: 'svc-smoke',
      vendorName: 'Vonage',
      filename: 'bill.pdf',
      billStoragePath: 'bills/smoke.pdf',
      parseResult,
      customerEmail: 'member@test.com',
      customerName: 'Member Test',
    });
    await createPortalLeadForBillReview(review);
    const leads = listLocalPortalLeads();
    if (!leads.some((l) => l.id === 'lead-review-' + review.id)) throw new Error('lead not in local store');
    submitLocalBillAnalysisConfirmation(review.id, 'user-smoke', {
      notes: 'Smoke test confirmation',
      porting: { portAll: true, selectedNumbers: ['(555) 000-1111'] },
    });
    const threads = listLocalCustomerThreads('user-smoke');
    if (!threads.some((t) => t.analysis_review_id === review.id)) throw new Error('message thread missing');
    const msgs = listLocalCustomerMessages(threads.map((t) => t.id));
    const teamMsg = msgs.find((m) => m.author === 'team');
    if (!teamMsg?.body?.includes('reviewing')) throw new Error('team message body missing');
    console.log('INTEGRATION_OK leads=' + leads.length + ' threads=' + threads.length);
  `;
  try {
    const out = execFileSync(process.execPath, [tsx, '--eval', integration], {
      cwd: root,
      encoding: 'utf8',
    });
    if (out.includes('INTEGRATION_OK')) pass('Local E2E', out.match(/INTEGRATION_OK.*/)?.[0] ?? '');
    else fail('Local E2E', out.trim());
  } catch (e) {
    fail('Local E2E', e.stderr?.toString() || e.message);
  }

  console.log('\n--- Summary ---');
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL: ${f.name} — ${f.detail}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
