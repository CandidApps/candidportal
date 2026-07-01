/**
 * Quick smoke test for bill analysis flow (B–E).
 * Run: npx tsx scripts/smoke-bill-flow.ts
 */
import { buildBillParseLineItems } from '../src/lib/bill-parse-display';
import { dedupePhoneLines } from '../src/lib/bill-parse-phones';
import { buildLeadFromBillReview } from '../src/lib/services/portal-leads';
import { buildConfirmAdminNotes } from '../src/lib/bill-analysis-confirm';
import type { BillAnalysisReviewRow, BillParseResult } from '../src/lib/bill-parse-types';
import {
  createLocalAnalysisReview,
  submitLocalBillAnalysisConfirmation,
} from '../src/lib/persistence/local-analysis-review';
import {
  listLocalCustomerMessages,
  listLocalCustomerThreads,
} from '../src/lib/persistence/local-message-center';
import { listLocalPortalLeads, upsertLocalPortalLead } from '../src/lib/persistence/local-portal-leads';
import {
  listDemoBillMeetingSlots,
} from '../src/lib/bill-meeting-scheduling';
import { saveLocalBillMeetingBooking } from '../src/lib/persistence/local-bill-meetings';

const store = new Map<string, string>();
store.set('candid-data-persistence-mode', 'local');
Object.assign(globalThis, { window: globalThis });
(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};

process.env.NEXT_PUBLIC_DATA_PERSISTENCE = 'local';

const results: { name: string; ok: boolean; detail?: string }[] = [];

function pass(name: string, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('Smoke test: bill analysis flow\n');

  try {
    const res = await fetch('http://localhost:3000/');
    if (res.ok || res.status === 307) pass('Dev server', `HTTP ${res.status}`);
    else fail('Dev server', `HTTP ${res.status}`);
  } catch (e) {
    fail('Dev server', e instanceof Error ? e.message : String(e));
  }

  for (const [label, url] of [
    ['Admin leads API', 'http://localhost:3000/api/admin/leads'],
    ['Portal message center API', 'http://localhost:3000/api/portal/message-center'],
  ]) {
    try {
      const res = await fetch(url);
      if (res.status === 401) pass(label, '401 without session (expected)');
      else fail(label, `HTTP ${res.status}`);
    } catch (e) {
      fail(label, e instanceof Error ? e.message : String(e));
    }
  }

  try {
    const parseResult: BillParseResult = {
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
    if (items.length < 3) throw new Error(`line items too few: ${items.length}`);
    const phones = dedupePhoneLines(parseResult.ucaasPhoneLines ?? []);
    if (phones.length !== 2) throw new Error('phone dedupe failed');
    const now = new Date().toISOString();
    const review: BillAnalysisReviewRow = {
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
      created_at: now,
      updated_at: now,
    };
    const lead = buildLeadFromBillReview(review, { companyName: 'Smoke Co' });
    if (!lead.helpWith?.includes('RingCentral')) throw new Error('lead missing vendor');
    const notes = buildConfirmAdminNotes(
      { notes: 'test note', porting: { portAll: true, selectedNumbers: ['(555) 111-2222'] } },
      phones,
      now,
    );
    if (!notes.includes('Customer porting')) throw new Error('admin notes missing porting');
    pass('Parse/display/lead/confirm modules');
  } catch (e) {
    fail('Parse/display/lead/confirm modules', e instanceof Error ? e.message : String(e));
  }

  try {
    const specialists = [
      { id: 'josh', name: 'Josh', email: 'josh@candid.solutions' },
      { id: 'joe', name: 'Joe', email: 'joe@candid.solutions' },
    ];
    const demo = listDemoBillMeetingSlots(specialists, 2);
    if (!demo.length) throw new Error('no demo slots');
    if (!demo.every((s) => new Date(s.startISO).getMinutes() % 15 === 0)) {
      throw new Error('slot not on 15-min grid');
    }
    pass('Bill meeting scheduling modules', `demoSlots=${demo.length}`);
  } catch (e) {
    fail('Bill meeting scheduling modules', e instanceof Error ? e.message : String(e));
  }

  try {
    const parseResult: BillParseResult = {
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
    upsertLocalPortalLead(review.id, 'user-smoke', buildLeadFromBillReview(review));
    const leads = listLocalPortalLeads();
    if (!leads.some((l) => l.id === `lead-review-${review.id}`)) {
      throw new Error('lead not in local store');
    }
    submitLocalBillAnalysisConfirmation(review.id, 'user-smoke', {
      notes: 'Smoke test confirmation',
      porting: { portAll: true, selectedNumbers: ['(555) 000-1111'] },
    });
    const threads = listLocalCustomerThreads('user-smoke');
    if (!threads.some((t) => t.analysis_review_id === review.id)) {
      throw new Error('message thread missing');
    }
    const msgs = listLocalCustomerMessages(threads.map((t) => t.id));
    const teamMsg = msgs.find((m) => m.author === 'team');
    if (!teamMsg?.body?.includes('reviewing')) throw new Error('team message body missing');
    const meetingSlots = listDemoBillMeetingSlots(
      [{ id: 'josh', name: 'Josh', email: 'josh@candid.solutions' }],
      1,
    );
    if (!meetingSlots[0]) throw new Error('meeting slot missing');
    saveLocalBillMeetingBooking({
      userId: 'user-smoke',
      analysisReviewId: review.id,
      specialist: { id: 'josh', name: 'Josh', email: 'josh@candid.solutions' },
      customerName: 'Member Test',
      customerEmail: 'member@test.com',
      vendorName: 'Vonage',
      startISO: meetingSlots[0].startISO,
      endISO: meetingSlots[0].endISO,
      title: 'Bill analysis call — Vonage',
    });
    pass('Local E2E', `leads=${leads.length} threads=${threads.length}`);
  } catch (e) {
    fail('Local E2E', e instanceof Error ? e.message : String(e));
  }

  console.log('\n--- Summary ---');
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

void main();
