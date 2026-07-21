'use client';

import { useMemo, useState } from 'react';
import { MemberSavingsProposal } from '@/components/member/MemberSavingsProposal';
import { AcceptQuotePanel } from '@/components/member/AcceptQuotePanel';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import { merchantFormForQuote, merchantFormFromQuoteRow } from '@/lib/quotes/merchant-quote-statement';
import { buildMerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';

const emptyCta = { name: '', phone: '', email: '', date: '', time: '', notes: '' };

/** Member-facing merchant quote with statement-based current vs savings comparison. */
export function MemberQuoteMerchantSavings({
  snapshot,
  subject,
  onBack,
  quoteRequestId,
  contactName,
  contactEmail,
  contactPhone,
  allowAccept = true,
  quoteRow,
}: {
  snapshot: PublishedQuoteSnapshot;
  subject?: string;
  onBack: () => void;
  quoteRequestId?: string | null;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  allowAccept?: boolean;
  /** Optional row for contact defaults when form fields are sparse. */
  quoteRow?: QuoteRequestRow | null;
}) {
  const [ctaForm, setCtaForm] = useState({
    ...emptyCta,
    name: contactName ?? quoteRow?.contact_name ?? '',
    email: contactEmail ?? quoteRow?.contact_email ?? '',
    phone: contactPhone ?? quoteRow?.contact_phone ?? '',
  });
  const [ctaSent, setCtaSent] = useState(false);

  const statements = snapshot.merchantQuote?.statements ?? [];
  const form = useMemo(() => {
    if (quoteRow) return merchantFormForQuote(quoteRow, snapshot.merchantQuote);
    const stub = merchantFormFromQuoteRow({
      company: snapshot.serviceLabel,
      contact_name: contactName ?? '',
      contact_email: contactEmail ?? '',
      contact_phone: contactPhone ?? '',
      service_answers: {},
    } as QuoteRequestRow);
    if (!snapshot.merchantQuote?.statements?.length) return stub;
    const { form: fromStmt } = buildMerchantAnalysisSnapshot(snapshot.merchantQuote.statements, false);
    return {
      ...stub,
      ...fromStmt,
      merchantName: snapshot.merchantQuote.vendorName?.trim() || fromStmt.merchantName || stub.merchantName,
      contactName: contactName ?? stub.contactName,
      contactEmail: contactEmail ?? stub.contactEmail,
      contactPhone: contactPhone ?? stub.contactPhone,
    };
  }, [snapshot, quoteRow, contactName, contactEmail, contactPhone]);

  const serviceLabel = subject ?? snapshot.serviceLabel;

  return (
    <div className="proposal-analysis-embed">
      <div className="proposal-analysis-header">
        <div>
          <div className="proposal-analysis-eyebrow">Your quote</div>
          <h2 className="proposal-analysis-title">{serviceLabel}</h2>
        </div>
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>

      {snapshot.adminMessage ? (
        <div className="msp-callout msp-callout--info" style={{ marginBottom: 16, textAlign: 'left' }}>
          {snapshot.adminMessage}
        </div>
      ) : null}

      <MemberSavingsProposal
        form={form}
        statements={statements}
        ctaForm={ctaForm}
        setCtaForm={setCtaForm}
        ctaSent={ctaSent}
        onCtaSubmit={() => setCtaSent(true)}
        pricingStructureOptions={snapshot.pricingStructureOptions}
        partnerName={snapshot.matchedProviderName}
        showSupplierName={snapshot.showSupplierName}
      />

      {allowAccept ? (
        <AcceptQuotePanel
          quoteRequestId={quoteRequestId}
          serviceLabel={serviceLabel}
          contactName={contactName}
          contactEmail={contactEmail}
          contactPhone={contactPhone}
        />
      ) : null}
    </div>
  );
}
