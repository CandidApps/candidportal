'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AppIcon } from '@/components/AppIcon';
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

type AcceptQuoteContextValue = {
  analysisReviewId?: string | null;
  quoteRequestId?: string | null;
  acceptance: QuoteCustomerAcceptance | null;
  loadingStatus: boolean;
  markAccepted: (acceptance: QuoteCustomerAcceptance) => void;
};

const AcceptQuoteContext = createContext<AcceptQuoteContextValue | null>(null);

function useAcceptQuoteContext() {
  return useContext(AcceptQuoteContext);
}

type AcceptQuoteProviderProps = {
  analysisReviewId?: string | null;
  quoteRequestId?: string | null;
  onAccepted?: () => void;
  children: ReactNode;
};

export function QuoteAcceptProvider({
  analysisReviewId,
  quoteRequestId,
  onAccepted,
  children,
}: AcceptQuoteProviderProps) {
  const canAccept = Boolean(analysisReviewId || quoteRequestId);
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

  const markAccepted = useCallback(
    (next: QuoteCustomerAcceptance) => {
      setAcceptance(next);
      onAccepted?.();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('candid-contract-updated'));
      }
    },
    [onAccepted],
  );

  if (!canAccept) return <>{children}</>;

  return (
    <AcceptQuoteContext.Provider
      value={{ analysisReviewId, quoteRequestId, acceptance, loadingStatus, markAccepted }}
    >
      {children}
    </AcceptQuoteContext.Provider>
  );
}

export function QuoteAcceptedBanner({ serviceLabel }: { serviceLabel: string }) {
  const ctx = useAcceptQuoteContext();
  if (!ctx?.acceptance) return null;
  const { acceptance } = ctx;

  const acceptedDate = new Date(acceptance.acceptedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="quote-accepted-banner" role="status">
      <div className="quote-accepted-banner-icon">
        <AppIcon name="check" size={24} />
      </div>
      <div className="quote-accepted-banner-body">
        <div className="quote-accepted-banner-title">Quote accepted</div>
        <div className="quote-accepted-banner-sub">
          You accepted <strong>{serviceLabel}</strong> on {acceptedDate}. We&apos;ve added it to{' '}
          <strong>My Services</strong> with Candid as <strong>Pending contract</strong> — your
          specialist will follow up to complete onboarding.
        </div>
        {(acceptance.monthlyTotal != null || acceptance.annualSavings != null) && (
          <div className="quote-accepted-banner-meta">
            {acceptance.monthlyTotal != null && (
              <span>
                Monthly <strong>{fmt$(acceptance.monthlyTotal)}</strong>
              </span>
            )}
            {acceptance.annualSavings != null && acceptance.annualSavings > 0 && (
              <span>
                Est. annual savings <strong>{fmt$(acceptance.annualSavings)}</strong>
              </span>
            )}
          </div>
        )}
        {acceptance.details?.trim() ? (
          <div className="quote-accepted-banner-notes">
            Your notes: {acceptance.details.trim()}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AcceptQuotePanel({
  accountServiceId,
  serviceLabel,
  contactName,
  contactEmail,
  contactPhone,
  packageTotals,
}: {
  accountServiceId?: string | null;
  serviceLabel: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  packageTotals?: AcceptQuotePackageTotals;
}) {
  const ctx = useAcceptQuoteContext();
  if (!ctx) return null;
  const { analysisReviewId, quoteRequestId, acceptance, loadingStatus, markAccepted } = ctx;
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      if (data.acceptance) markAccepted(data.acceptance);
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

  if (acceptance) return null;

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

/** Standalone accept UI when provider is not used (legacy embeds). */
export function AcceptQuoteBlock(
  props: AcceptQuoteProviderProps & {
    accountServiceId?: string | null;
    serviceLabel: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    packageTotals?: AcceptQuotePackageTotals;
  },
) {
  const {
    serviceLabel,
    accountServiceId,
    contactName,
    contactEmail,
    contactPhone,
    packageTotals,
    children,
    ...providerProps
  } = props;

  return (
    <QuoteAcceptProvider {...providerProps}>
      <QuoteAcceptedBanner serviceLabel={serviceLabel} />
      {children}
      <AcceptQuotePanel
        accountServiceId={accountServiceId}
        serviceLabel={serviceLabel}
        contactName={contactName}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
        packageTotals={packageTotals}
      />
    </QuoteAcceptProvider>
  );
}
