import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  REVIEW_ESCALATION_CATEGORIES,
  serviceRequestSubject,
  type ServiceRequestCategory,
} from '@/lib/service-request-config';
import { MEMBER_RESPONSE_SLA_HOURS } from '@/lib/member-request-sla';
import type { MemberReviewRequestSource } from '@/lib/services/member-review-requests';
import { computeUcaasQuote } from '@/lib/ucaas/quote-engine';
import {
  parseSavingsBaseline,
  resolveSeatLines,
} from '@/lib/services/service-savings';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import type { UcaasQuoteSnapshot } from '@/lib/ucaas/types';

export const dynamic = 'force-dynamic';

type PostBody = {
  category?: ServiceRequestCategory;
  outcome?: 'self_service' | 'escalated';
  message?: string;
  serviceName?: string;
  vendorName?: string;
  customerName?: string;
  customerEmail?: string;
  accountServiceId?: string;
  analysisReviewId?: string;
  crmCustomerId?: string;
  requestSource?: MemberReviewRequestSource;
  guideId?: string;
  guideTitle?: string;
  addedSeatCount?: number;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('member_service_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    if (/member_service_requests/.test(error.message)) {
      return NextResponse.json({ requests: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const category = body.category;
  const outcome = body.outcome;
  const serviceName = body.serviceName?.trim();
  if (!category || !outcome || !serviceName) {
    return NextResponse.json({ error: 'category, outcome, and serviceName required' }, { status: 400 });
  }

  const message = body.message?.trim() || null;
  const subject = serviceRequestSubject(category, serviceName);
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  let linkedTicketId: string | null = null;
  let linkedReviewRequestId: string | null = null;
  let dbOutcome: 'self_service' | 'escalated_ticket' | 'escalated_review' = 'self_service';
  let status: 'resolved_self_service' | 'resolved' = 'resolved_self_service';

  if (outcome === 'escalated') {
    if (!message) {
      return NextResponse.json({ error: 'message required when escalating' }, { status: 400 });
    }

    if (REVIEW_ESCALATION_CATEGORIES.has(category)) {
      dbOutcome = 'escalated_review';
      const requestSource = body.requestSource ?? 'my_services';
      const reviewSubject =
        requestSource === 'savings_opportunity'
          ? `Savings review — ${serviceName}`
          : subject;

      if (body.accountServiceId) {
        const { data: existing } = await admin
          .from('member_review_requests')
          .select('id')
          .eq('user_id', user.id)
          .eq('account_service_id', body.accountServiceId)
          .in('status', ['open', 'in_progress'])
          .maybeSingle();
        if (existing?.id) {
          return NextResponse.json(
            { error: 'You already have an open review request for this service.' },
            { status: 409 },
          );
        }
      }

      const { data: review, error: reviewErr } = await admin
        .from('member_review_requests')
        .insert({
          user_id: user.id,
          account_service_id: body.accountServiceId ?? null,
          analysis_review_id: body.analysisReviewId ?? null,
          crm_customer_id: body.crmCustomerId ?? null,
          request_source: requestSource,
          service_name: serviceName,
          vendor_name: body.vendorName?.trim() || null,
          customer_name: body.customerName?.trim() || null,
          customer_email: body.customerEmail?.trim() || user.email,
          subject: reviewSubject,
          message: `[${category}] ${message}`,
          status: 'open',
        })
        .select('id')
        .single();

      if (reviewErr) {
        return NextResponse.json({ error: reviewErr.message }, { status: 500 });
      }
      linkedReviewRequestId = review?.id ?? null;
    } else {
      dbOutcome = 'escalated_ticket';
      const { data: ticket, error: ticketErr } = await admin
        .from('customer_service_tickets')
        .insert({
          user_id: user.id,
          account_service_id: body.accountServiceId ?? null,
          service_name: serviceName,
          subject,
          message: `[${category}] ${message}`,
          customer_name: body.customerName?.trim() || null,
          customer_email: body.customerEmail?.trim() || user.email,
          status: 'open',
        })
        .select('id')
        .single();

      if (ticketErr) {
        if (/customer_service_tickets/.test(ticketErr.message)) {
          // Table missing — still log the service request so admin sees it in Action Center.
          console.warn('[service-requests] customer_service_tickets missing — apply migration 0061');
        } else {
          return NextResponse.json({ error: ticketErr.message }, { status: 500 });
        }
      } else {
        linkedTicketId = ticket?.id ?? null;
      }
    }
    status = 'resolved';
  }

  const { data: row, error: insertErr } = await admin
    .from('member_service_requests')
    .insert({
      user_id: user.id,
      category,
      subject,
      message,
      status,
      outcome: dbOutcome,
      account_service_id: body.accountServiceId ?? null,
      service_name: serviceName,
      vendor_name: body.vendorName?.trim() || null,
      customer_name: body.customerName?.trim() || null,
      customer_email: body.customerEmail?.trim() || user.email,
      guide_id: body.guideId ?? null,
      guide_title: body.guideTitle ?? null,
      linked_ticket_id: linkedTicketId,
      linked_review_request_id: linkedReviewRequestId,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (insertErr) {
    if (/member_service_requests/.test(insertErr.message)) {
      return NextResponse.json({ error: 'Apply migration 0059 first' }, { status: 503 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Additional seats: bump added_seat_count so My Services can show adjusted savings vs old provider.
  const addedSeats = Math.max(0, Math.floor(Number(body.addedSeatCount) || 0));
  if (
    outcome === 'escalated' &&
    category === 'additional_services' &&
    body.accountServiceId &&
    addedSeats > 0
  ) {
    const { data: svc } = await admin
      .from('account_services')
      .select('added_seat_count, user_count, savings_baseline, analysis_snapshot, monthly_amount_cents')
      .eq('id', body.accountServiceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (svc) {
      const prevAdded = Number(svc.added_seat_count) || 0;
      const nextAdded = prevAdded + addedSeats;
      const baseline = parseSavingsBaseline(svc.savings_baseline);
      const snap = svc.analysis_snapshot as PublishedAnalysisSnapshot | null;
      const updates: Record<string, unknown> = {
        added_seat_count: nextAdded,
        updated_at: now,
      };
      if (baseline?.candidSeatCount) {
        updates.user_count = baseline.candidSeatCount + nextAdded;
      } else if (svc.user_count != null) {
        updates.user_count = Number(svc.user_count) + addedSeats;
      } else {
        updates.user_count = addedSeats;
      }

      // Refresh Candid monthly MRC from UCaaS quote at the new seat count (do not mutate published snapshot).
      if (snap?.ucaasQuote && baseline) {
        try {
          const quote = snap.ucaasQuote as UcaasQuoteSnapshot;
          const seatIds = baseline.seatItemIds.length
            ? baseline.seatItemIds
            : resolveSeatLines(quote).map((l) => l.itemId);
          const primary =
            seatIds
              .map((id) => quote.lines.find((l) => l.itemId === id))
              .filter((l): l is NonNullable<typeof l> => Boolean(l))
              .sort((a, b) => b.quantity - a.quantity)[0] ?? null;
          const lines = primary
            ? quote.lines.map((l) =>
                l.itemId === primary.itemId ? { ...l, quantity: l.quantity + nextAdded } : l,
              )
            : quote.lines;
          const totals = computeUcaasQuote({
            lines,
            fees: quote.fees,
            setupTaxes: quote.setupTaxes,
            monthlyTaxRatePct: quote.monthlyTaxRatePct,
            currentMonthlySpend: quote.currentMonthlySpend,
          });
          updates.monthly_amount_cents = Math.round(totals.monthlyTotal * 100);
        } catch {
          /* keep prior MRC */
        }
      }

      await admin.from('account_services').update(updates).eq('id', body.accountServiceId);
    }
  }

  const notifTitle =
    outcome === 'self_service'
      ? 'Request resolved with self-service guide'
      : dbOutcome === 'escalated_review'
        ? 'Review request submitted'
        : 'Support request submitted';
  const notifBody =
    outcome === 'self_service'
      ? `You used supplier instructions for ${serviceName}. We've logged this for your records.`
      : `The Candid team will follow up within ${MEMBER_RESPONSE_SLA_HOURS} hours.`;

  await admin
    .from('member_notifications')
    .insert({
      user_id: user.id,
      type: outcome === 'self_service' ? 'service_request_self_service' : 'service_request',
      title: notifTitle,
      body: notifBody,
    })
    .then(
      () => undefined,
      () => undefined,
    );

  return NextResponse.json({ request: row, linkedTicketId, linkedReviewRequestId });
}
