'use client';

import { useCallback, useEffect, useState } from 'react';
import { fmt$ } from '@/lib/candid-pay/pricingEngine';
import type { QuoteCustomerAcceptance } from '@/lib/quotes/quote-acceptance';
import type { UcaasQuoteLine } from '@/lib/ucaas/types';

export type AcceptQuotePackageTotals = {
  monthlyTotal?: number | null;
  setupTotal?: number | null;
  annualSavings?: number | null;
  monthlySavings?: number | null;
  lines?: UcaasQuoteLine[] | null;
};

type AcceptQuotePanelProps = {
  analysisReviewId?: string | null;
  quoteRequestId?: string | null;
  accountServiceId?: string | null;
  serviceLabel: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  packageTotals?: AcceptQuotePackageTotals;
};

export function AcceptQuotePanel({
  analysisReviewId,
  quoteRequestId,
  accountServiceId,
  serviceLabel,
  contactName,
  contactEmail,
  contactPhone,
  packageTotals,
}: AcceptQuotePanelProps) {
  const canAccept = Boolean(analysisReviewId || quoteRequestId);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [acceptance, setAcceptance] = useState<QuoteCustomerAcceptance | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(canAccept);

  const loadStatus = useCallback(async () => {
    if (!canAccept) {
      setLoadingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      const params = new URLSearchParams();
      if (analysisReviewId) params.set('analysisReviewId', analysisReviewId);
      if (quoteRequestId) params.set('quoteRequestId', quoteRequestId);
      const res = await fetch(`/api/portal/quote-accept?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        acceptedAt?: string | null;
        acceptance?: QuoteCustomerAcceptance | null;
      };
      if (data.acceptance) setAcceptance(data.acceptance);
    } catch {
      /* ignore */
    } finally {
      setLoadingStatus(false);
    }
  }, [analysisReviewId, quoteRequestId, canAccept]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  if (!canAccept) return null;

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/portal/quote-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisReviewId: analysisReviewId || undefined,
          quoteRequestId: quoteRequestId || undefined,
          accountServiceId: accountServiceId || undefined,
          details: details.trim() || undefined,
          contactName: contactName || undefined,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
          serviceLabel,
          monthlyTotal: packageTotals?.monthlyTotal ?? undefined,
          setupTotal: packageTotals?.setupTotal ?? undefined,
          annualSavings: packageTotals?.annualSavings ?? undefined,
          monthlySavings: packageTotals?.monthlySavings ?? undefined,
          lines: packageTotals?.lines ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        acceptance?: QuoteCustomerAcceptance;
      };
      if (!res.ok) {
        setError(data.error ?? 'Could not accept quote');
        return;
      }
      if (data.acceptance) setAcceptance(data.acceptance);
    } catch {
      setError('Could not accept quote. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="muq-accept">
        <div className="muq-accept-loading">Checking quote status…</div>
      </div>
    );
  }

  if (acceptance) {
    return (
      <div className="muq-accept muq-accept--done">
        <span className="msp-package-submitted-icon">✓</span>
        <div>
          <strong>Quote accepted.</strong> Thanks — our team will follow up to complete setup
          {acceptance.details ? (
            <>
              .{' '}
              <span className="muq-accept-details-echo">Your notes were shared with Candid.</span>
            </>
          ) : (
            '.'
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="muq-accept">
      <div className="muq-accept-head">
        <strong>Ready to move forward?</strong>
        <span>Accept this quote and add any details we should know before we start onboarding.</span>
      </div>

      {(packageTotals?.monthlyTotal != null || packageTotals?.annualSavings != null) && (
        <div className="muq-accept-summary">
          {packageTotals.monthlyTotal != null && (
            <span>
              Monthly <strong>{fmt$(packageTotals.monthlyTotal)}</strong>
            </span>
          )}
          {packageTotals.annualSavings != null && packageTotals.annualSavings > 0 && (
            <span>
              Est. annual savings <strong>{fmt$(packageTotals.annualSavings)}</strong>
            </span>
          )}
        </div>
      )}

      <label className="muq-accept-label" htmlFor="quote-accept-details">
        Additional details <span>(optional)</span>
      </label>
      <textarea
        id="quote-accept-details"
        className="msp-package-note"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={3}
        placeholder="e.g. preferred go-live date, numbers to port, who should receive contracts…"
      />

      {error ? <p className="form-error">{error}</p> : null}

      <button
        type="button"
        className="btn-primary muq-accept-submit"
        disabled={submitting}
        onClick={() => void submit()}
      >
        {submitting ? 'Submitting…' : 'Accept quote'}
      </button>
    </div>
  );
}
