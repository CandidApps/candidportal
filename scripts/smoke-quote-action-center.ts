/**
 * Smoke test for quote request → Action Center flow + related recent admin work.
 * Run: npx tsx scripts/smoke-quote-action-center.ts
 */
import { buildUnifiedAdminTickets, TICKET_KIND_LABEL } from '../src/lib/admin-tickets';
import {
  filterPortalPreviewEntries,
  listAdminPortalPreviewEntries,
} from '../src/lib/admin-portal-preview';
import { QUOTE_SERVICE_TYPES } from '../src/lib/quote-flow-config';
import {
  buildQuoteRequestSubject,
  formatQuoteRequestAnswers,
  formatQuoteRequestDetail,
  normalizeQuoteRequestStatus,
  quoteRequestActionId,
  type QuoteRequestRow,
} from '../src/lib/services/quote-requests';
import type { Customer } from '../src/components/CustomersView';

const results: { name: string; ok: boolean; detail?: string }[] = [];

function pass(name: string, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function sampleQuoteRequest(overrides: Partial<QuoteRequestRow> = {}): QuoteRequestRow {
  const now = new Date().toISOString();
  return {
    id: 'qr-smoke-1',
    user_id: 'user-smoke',
    mode: 'request',
    contact_name: 'Jane Doe',
    company: 'Smoke Test Co',
    contact_email: 'jane@smoke.test',
    contact_phone: '555-0100',
    services: [],
    note: 'Need fiber ASAP',
    service_type_id: 'internet',
    service_answers: {
      deviceCount: '25',
      connectionType: 'fiber',
      backupConnection: true,
    },
    vendor_names: ['Zayo', 'Lumen'],
    location: { city: 'Austin', state: 'TX', zip: '78701' },
    subject: 'Quote request — Internet / Broadband (Smoke Test Co)',
    status: 'open',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

async function main() {
  console.log('Smoke test: quote Action Center + admin preview\n');

  try {
    const subject = buildQuoteRequestSubject({
      mode: 'request',
      company: 'Acme LLC',
      serviceTypeId: 'ucaas',
    });
    if (!subject.includes('UCaaS') || !subject.includes('Acme')) {
      throw new Error(`unexpected subject: ${subject}`);
    }
    const addSubject = buildQuoteRequestSubject({
      mode: 'add-services',
      company: 'Acme LLC',
      serviceTypeId: 'internet',
    });
    if (!addSubject.startsWith('Add services')) throw new Error(`unexpected add-services subject: ${addSubject}`);
    pass('buildQuoteRequestSubject');
  } catch (e) {
    fail('buildQuoteRequestSubject', e instanceof Error ? e.message : String(e));
  }

  try {
    const row = sampleQuoteRequest();
    const detail = formatQuoteRequestDetail(row);
    if (!detail.includes('Internet') || !detail.includes('Zayo')) {
      throw new Error(`detail missing fields: ${detail}`);
    }
    const answers = formatQuoteRequestAnswers(row);
    if (answers.length < 2) throw new Error(`expected answers, got ${answers.length}`);
    if (normalizeQuoteRequestStatus('submitted') !== 'open') throw new Error('submitted should map to open');
    if (quoteRequestActionId('abc') !== 'quote-req-abc') throw new Error('action id prefix wrong');
    pass('Quote request formatters', `answers=${answers.length}`);
  } catch (e) {
    fail('Quote request formatters', e instanceof Error ? e.message : String(e));
  }

  try {
    if (QUOTE_SERVICE_TYPES.length < 5) throw new Error('quote service types missing');
    pass('Quote flow config', `types=${QUOTE_SERVICE_TYPES.length}`);
  } catch (e) {
    fail('Quote flow config', e instanceof Error ? e.message : String(e));
  }

  try {
    const quote = sampleQuoteRequest();
    const tickets = buildUnifiedAdminTickets([], [], false, [], [], [], [quote]);
    const found = tickets.find((t) => t.kind === 'quote_request');
    if (!found) throw new Error('quote ticket not in unified list');
    if (found.id !== 'quote-req-qr-smoke-1') throw new Error(`wrong id: ${found.id}`);
    if (found.status !== 'open') throw new Error(`wrong status: ${found.status}`);
    if (!TICKET_KIND_LABEL.quote_request) throw new Error('missing kind label');
    const resolved = buildUnifiedAdminTickets([], [], false, [], [], [], [
      sampleQuoteRequest({ id: 'qr-2', status: 'resolved' }),
    ]);
    if (resolved.some((t) => t.kind === 'quote_request')) {
      throw new Error('resolved quote should be filtered when includeResolved=false');
    }
    pass('buildUnifiedAdminTickets', `open=${tickets.length}`);
  } catch (e) {
    fail('buildUnifiedAdminTickets', e instanceof Error ? e.message : String(e));
  }

  try {
    const customers: Customer[] = [
      {
        id: 'c1',
        company: 'Portal Co',
        status: 'active',
        agent: 'Josh',
        spend: 0,
        savings: 0,
        contracts: 0,
        files: 0,
        since: '2024-01-01',
        contacts: [
          {
            id: 'p1',
            name: 'Pat Portal',
            role: 'Owner',
            email: 'pat@portal.co',
            phone: '',
            isPrimary: true,
            portalAccess: true,
            portalAccessTier: 'full',
          },
        ],
        locations: [],
      },
      {
        id: 'c2',
        company: 'Paying Only Inc',
        status: 'active',
        agent: 'Joe',
        spend: 0,
        savings: 0,
        contracts: 0,
        files: 0,
        since: '2024-01-01',
        contacts: [
          {
            id: 'p2',
            name: 'Pay Customer',
            role: 'Owner',
            email: 'pay@paying.co',
            phone: '',
            isPrimary: true,
            portalAccess: false,
          },
        ],
        locations: [],
      },
      {
        id: 'c3',
        company: 'Prospect LLC',
        status: 'prospect',
        agent: 'Bryan',
        spend: 0,
        savings: 0,
        contracts: 0,
        files: 0,
        since: '2024-01-01',
        contacts: [
          {
            id: 'p3',
            name: 'No Access',
            role: 'Owner',
            email: 'no@prospect.co',
            phone: '',
            isPrimary: true,
            portalAccess: false,
          },
        ],
        locations: [],
      },
    ];
    const entries = listAdminPortalPreviewEntries(customers);
    if (entries.length !== 2) throw new Error(`expected 2 preview entries, got ${entries.length}`);
    const filtered = filterPortalPreviewEntries(entries, 'paying');
    if (filtered.length !== 1 || filtered[0]?.company !== 'Paying Only Inc') {
      throw new Error('preview search failed');
    }
    pass('Admin portal preview', `entries=${entries.length}`);
  } catch (e) {
    fail('Admin portal preview', e instanceof Error ? e.message : String(e));
  }

  for (const [label, url, method = 'GET'] of [
    ['Quote request API (POST)', 'http://localhost:3000/api/portal/quote-request', 'POST'],
    ['Admin quote PATCH API', 'http://localhost:3000/api/admin/quote-requests/00000000-0000-0000-0000-000000000001', 'PATCH'],
    ['Portal notifications API', 'http://localhost:3000/api/portal/notifications'],
  ] as const) {
    try {
      const res = await fetch(url, {
        method,
        headers: method === 'POST' || method === 'PATCH' ? { 'Content-Type': 'application/json' } : undefined,
        body:
          method === 'POST'
            ? JSON.stringify({ name: 'Smoke', company: 'Co', email: 'smoke@test.com' })
            : method === 'PATCH'
              ? JSON.stringify({ status: 'in_progress' })
              : undefined,
      });
      if (res.status === 401) pass(label, '401 without session (expected)');
      else fail(label, `HTTP ${res.status} (expected 401 without auth)`);
    } catch (e) {
      fail(label, e instanceof Error ? e.message : String(e));
    }
  }

  console.log('\n--- Summary ---');
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

void main();
