import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  formatAcceptanceSummary,
  parseQuoteCustomerAcceptance,
  type QuoteCustomerAcceptance,
} from '@/lib/quotes/quote-acceptance';
import type { UcaasQuoteLine } from '@/lib/ucaas/types';
import { computeUcaasQuote } from '@/lib/ucaas/quote-engine';
import { MEMBER_RESPONSE_SLA_HOURS } from '@/lib/member-request-sla';
import {
  assignContractSubmitAction,
  findLeadIdForContractSource,
  resolveContractSubmitAssigneeIds,
  syncLeadDealStage,
} from '@/lib/services/contract-submit-actions';
import { insertDealActivityEvent } from '@/lib/services/deal-activity';

export const dynamic = 'force-dynamic';

type AcceptBody = {
  analysisReviewId?: string;
  quoteRequestId?: string;
  accountServiceId?: string;
  details?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  serviceLabel?: string;
  monthlyTotal?: number;
  setupTotal?: number;
  annualSavings?: number;
  monthlySavings?: number;
  lines?: UcaasQuoteLine[];
};

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function appendCustomerAcceptMessage(params: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  analysisReviewId?: string | null;
  quoteRequestId?: string | null;
  body: string;
}) {
  const now = new Date().toISOString();
  let threadQuery = params.admin
    .from('customer_message_threads')
    .select('id')
    .eq('user_id', params.userId);

  if (params.analysisReviewId) {
    threadQuery = threadQuery.eq('analysis_review_id', params.analysisReviewId);
  } else if (params.quoteRequestId) {
    threadQuery = threadQuery.eq('quote_request_id', params.quoteRequestId);
  } else {
    return;
  }

  const { data: thread } = await threadQuery.maybeSingle();
  if (!thread?.id) return;

  await params.admin.from('customer_messages').insert({
    thread_id: thread.id,
    user_id: params.userId,
    author: 'customer',
    body: params.body,
    attachments: [],
    created_at: now,
  });
  await params.admin
    .from('customer_message_threads')
    .update({ updated_at: now, status: 'open' })
    .eq('id', thread.id);
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const analysisReviewId = url.searchParams.get('analysisReviewId');
  const quoteRequestId = url.searchParams.get('quoteRequestId');
  if (!analysisReviewId && !quoteRequestId) {
    return NextResponse.json({ error: 'analysisReviewId or quoteRequestId required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (analysisReviewId) {
    const { data, error } = await admin
      .from('bill_analysis_reviews')
      .select('id, user_id, customer_accepted_at, customer_acceptance')
      .eq('id', analysisReviewId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({
      acceptedAt: data.customer_accepted_at,
      acceptance: parseQuoteCustomerAcceptance(data.customer_acceptance),
    });
  }

  const { data, error } = await admin
    .from('quote_requests')
    .select('id, user_id, customer_accepted_at, customer_acceptance')
    .eq('id', quoteRequestId!)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({
    acceptedAt: data.customer_accepted_at,
    acceptance: parseQuoteCustomerAcceptance(data.customer_acceptance),
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: AcceptBody;
  try {
    body = (await request.json()) as AcceptBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const analysisReviewId = body.analysisReviewId?.trim() || null;
  const quoteRequestId = body.quoteRequestId?.trim() || null;
  if (!analysisReviewId && !quoteRequestId) {
    return NextResponse.json(
      { error: 'analysisReviewId or quoteRequestId required' },
      { status: 400 },
    );
  }

  const details = body.details?.trim() || null;
  const now = new Date().toISOString();
  const admin = createSupabaseAdminClient();

  let serviceLabel = body.serviceLabel?.trim() || 'your quote';
  let accountServiceId = body.accountServiceId?.trim() || null;
  let vendorName: string | null = null;
  let customerName = body.contactName?.trim() || null;
  let customerEmail = body.contactEmail?.trim() || user.email || null;
  let accountName: string | null = null;
  let publishedBy: string | null = null;
  let crmCustomerExternalId: string | null = null;
  let publishedLines: UcaasQuoteLine[] | null = null;
  let publishedUcaasTotals: {
    monthlyTotal?: number | null;
    setupTotal?: number | null;
    annualSavings?: number | null;
    monthlySavings?: number | null;
  } | null = null;

  if (analysisReviewId) {
    const { data: review, error } = await admin
      .from('bill_analysis_reviews')
      .select(
        'id, user_id, status, vendor_name, customer_name, customer_email, account_service_id, customer_accepted_at, customer_acceptance, published_snapshot, published_by, crm_customer_id',
      )
      .eq('id', analysisReviewId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!review || review.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (review.status !== 'published') {
      return NextResponse.json({ error: 'Quote is not published yet' }, { status: 400 });
    }

    if (review.customer_accepted_at) {
      return NextResponse.json({
        ok: true,
        alreadyAccepted: true,
        acceptedAt: review.customer_accepted_at,
        acceptance: parseQuoteCustomerAcceptance(review.customer_acceptance),
      });
    }

    vendorName = review.vendor_name;
    serviceLabel = body.serviceLabel?.trim() || review.vendor_name || serviceLabel;
    accountServiceId = accountServiceId || review.account_service_id;
    customerName = customerName || review.customer_name;
    customerEmail = customerEmail || review.customer_email || user.email;
    publishedBy = (review.published_by as string | null) ?? null;

    const snap = review.published_snapshot as {
      ucaasQuote?: {
        lines?: UcaasQuoteLine[];
        fees?: unknown[];
        setupTaxes?: unknown[];
        monthlyTaxRatePct?: number;
        currentMonthlySpend?: number;
      };
    } | null;
    if (snap?.ucaasQuote?.lines?.length) {
      publishedLines = snap.ucaasQuote.lines;
      try {
        const totals = computeUcaasQuote({
          lines: snap.ucaasQuote.lines,
          fees: (snap.ucaasQuote.fees as never[]) ?? [],
          setupTaxes: (snap.ucaasQuote.setupTaxes as never[]) ?? [],
          monthlyTaxRatePct: snap.ucaasQuote.monthlyTaxRatePct ?? 0,
          currentMonthlySpend: snap.ucaasQuote.currentMonthlySpend ?? 0,
        });
        publishedUcaasTotals = {
          monthlyTotal: totals.monthlyTotal,
          setupTotal: totals.setupTotal,
          annualSavings: Math.max(0, totals.annualSavings),
          monthlySavings: Math.max(0, totals.monthlySavings),
        };
      } catch {
        /* ignore */
      }
    }

    const crmRef = (review.crm_customer_id as string | null) ?? null;
    if (crmRef) {
      const { data: cust } = await admin
        .from('customers')
        .select('external_id, company, company_legal')
        .or(`id.eq.${crmRef},external_id.eq.${crmRef}`)
        .limit(1)
        .maybeSingle();
      crmCustomerExternalId = cust?.external_id ? String(cust.external_id) : crmRef;
      accountName =
        (cust?.company as string | null)?.trim() ||
        (cust?.company_legal as string | null)?.trim() ||
        null;
    }
    if (!crmCustomerExternalId && accountServiceId) {
      const { data: svc } = await admin
        .from('account_services')
        .select('crm_customer_id')
        .eq('id', accountServiceId)
        .maybeSingle();
      const svcCrm = (svc?.crm_customer_id as string | null)?.trim() || null;
      if (svcCrm) {
        crmCustomerExternalId = svcCrm;
        if (!accountName) {
          const { data: cust } = await admin
            .from('customers')
            .select('company, company_legal')
            .or(`id.eq.${svcCrm},external_id.eq.${svcCrm}`)
            .limit(1)
            .maybeSingle();
          accountName =
            (cust?.company as string | null)?.trim() ||
            (cust?.company_legal as string | null)?.trim() ||
            null;
        }
      }
    }
  } else if (quoteRequestId) {
    const { data: quote, error } = await admin
      .from('quote_requests')
      .select(
        'id, user_id, subject, company, contact_name, contact_email, published_quote_snapshot, published_at, customer_accepted_at, customer_acceptance, published_by',
      )
      .eq('id', quoteRequestId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!quote || quote.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!quote.published_quote_snapshot && !quote.published_at) {
      return NextResponse.json({ error: 'Quote is not published yet' }, { status: 400 });
    }

    if (quote.customer_accepted_at) {
      return NextResponse.json({
        ok: true,
        alreadyAccepted: true,
        acceptedAt: quote.customer_accepted_at,
        acceptance: parseQuoteCustomerAcceptance(quote.customer_acceptance),
      });
    }

    serviceLabel =
      body.serviceLabel?.trim() ||
      quote.subject ||
      quote.company ||
      serviceLabel;
    customerName = customerName || quote.contact_name;
    customerEmail = customerEmail || quote.contact_email || user.email;
    accountName = accountName || quote.company?.trim() || null;
    publishedBy = (quote.published_by as string | null) ?? null;
  }

  const acceptance: QuoteCustomerAcceptance = {
    acceptedAt: now,
    details,
    contactName: customerName,
    contactEmail: customerEmail,
    contactPhone: body.contactPhone?.trim() || null,
    serviceLabel,
    monthlyTotal: numOrNull(body.monthlyTotal) ?? publishedUcaasTotals?.monthlyTotal ?? null,
    setupTotal: numOrNull(body.setupTotal) ?? publishedUcaasTotals?.setupTotal ?? null,
    annualSavings: numOrNull(body.annualSavings) ?? publishedUcaasTotals?.annualSavings ?? null,
    monthlySavings: numOrNull(body.monthlySavings) ?? publishedUcaasTotals?.monthlySavings ?? null,
    lines: Array.isArray(body.lines) && body.lines.length ? body.lines : publishedLines,
    ticketId: null,
  };

  const leadId = await findLeadIdForContractSource({
    analysisReviewId,
    quoteRequestId,
  });

  if (!accountName && leadId) {
    const { data: leadRow } = await admin
      .from('portal_leads')
      .select('lead_data')
      .eq('id', leadId)
      .maybeSingle();
    const friendly = (leadRow?.lead_data as { companyFriendly?: string } | null)?.companyFriendly;
    if (friendly?.trim()) accountName = friendly.trim();
  }

  const { data: submitAction, error: submitErr } = await admin
    .from('contract_submit_actions')
    .insert({
      user_id: user.id,
      analysis_review_id: analysisReviewId,
      quote_request_id: quoteRequestId,
      account_service_id: accountServiceId,
      service_label: serviceLabel,
      account_name: accountName,
      customer_name: customerName,
      customer_email: customerEmail,
      details,
      acceptance,
      status: 'quote_accepted',
      vendor_name: vendorName,
      lead_id: leadId,
      crm_customer_external_id: crmCustomerExternalId,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (submitErr) {
    if (/contract_submit_actions/.test(submitErr.message)) {
      return NextResponse.json(
        { error: 'Apply contract_submit_actions migration first' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: submitErr.message }, { status: 500 });
  }

  acceptance.ticketId = submitAction?.id ?? null;

  if (submitAction?.id) {
    await admin
      .from('contract_submit_actions')
      .update({ acceptance, updated_at: now })
      .eq('id', submitAction.id)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  const assigneePlan = await resolveContractSubmitAssigneeIds({
    analysisReviewId,
    quoteRequestId,
    publishedBy,
  });
  if (submitAction?.id && assigneePlan.userIds.length) {
    await assignContractSubmitAction({
      actionId: submitAction.id,
      userIds: assigneePlan.userIds,
      autoClaim: assigneePlan.autoClaim,
    }).catch((err) => {
      console.warn('[quote-accept] auto-assign failed', err);
    });
  }

  if (leadId) {
    await syncLeadDealStage({
      leadId,
      stage: 'quote_accepted',
      lifecycle: 'open',
    }).catch(() => undefined);

    await insertDealActivityEvent({
      leadId,
      contractSubmitActionId: submitAction?.id ?? null,
      crmCustomerExternalId,
      eventType: 'status_change',
      toStatus: 'quote_accepted',
      payload: {
        note: 'Customer accepted quote',
        serviceLabel,
        vendorName,
      },
    }).catch(() => undefined);
  }

  if (analysisReviewId) {
    const { error: updErr } = await admin
      .from('bill_analysis_reviews')
      .update({
        customer_accepted_at: now,
        customer_acceptance: acceptance,
        updated_at: now,
      })
      .eq('id', analysisReviewId)
      .eq('user_id', user.id);
    if (updErr) {
      if (/customer_accepted/.test(updErr.message)) {
        return NextResponse.json(
          { error: 'Apply quote_customer_acceptance migration first' },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Move opportunity toward managed when they accept (still needs ops follow-up).
    if (accountServiceId) {
      await admin
        .from('account_services')
        .update({
          savings_opportunity_only: false,
          updated_at: now,
        })
        .eq('id', accountServiceId)
        .eq('user_id', user.id)
        .then(
          () => undefined,
          () => undefined,
        );
    }

    await admin
      .from('portal_leads')
      .update({ deal_stage: 'quote_accepted', lifecycle: 'open' })
      .eq('analysis_review_id', analysisReviewId)
      .in('lifecycle', ['open', 'converted'])
      .then(
        () => undefined,
        () => undefined,
      );
  } else if (quoteRequestId) {
    const { error: updErr } = await admin
      .from('quote_requests')
      .update({
        customer_accepted_at: now,
        customer_acceptance: acceptance,
        updated_at: now,
      })
      .eq('id', quoteRequestId)
      .eq('user_id', user.id);
    if (updErr) {
      if (/customer_accepted/.test(updErr.message)) {
        return NextResponse.json(
          { error: 'Apply quote_customer_acceptance migration first' },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    await admin
      .from('portal_leads')
      .update({ deal_stage: 'quote_accepted', lifecycle: 'open' })
      .eq('quote_request_id', quoteRequestId)
      .in('lifecycle', ['open', 'converted'])
      .then(
        () => undefined,
        () => undefined,
      );
  }

  const customerMsg = formatAcceptanceSummary(acceptance);
  await appendCustomerAcceptMessage({
    admin,
    userId: user.id,
    analysisReviewId,
    quoteRequestId,
    body: customerMsg,
  });

  await admin
    .from('member_notifications')
    .insert({
      user_id: user.id,
      type: 'quote_accepted',
      title: 'Quote accepted',
      body: `Thanks — we received your acceptance for ${serviceLabel}. A specialist will follow up within ${MEMBER_RESPONSE_SLA_HOURS} hours.`,
      analysis_review_id: analysisReviewId,
      account_service_id: accountServiceId,
    })
    .then(
      () => undefined,
      () => undefined,
    );

  return NextResponse.json({
    ok: true,
    acceptedAt: now,
    acceptance,
    ticketId: submitAction?.id ?? null,
    vendorName,
  });
}
