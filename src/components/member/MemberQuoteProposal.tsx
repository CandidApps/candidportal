'use client';

import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import { quoteItemsFromSnapshot } from '@/lib/quotes/quote-items';
import { portalQuoteProposalUrl } from '@/lib/quotes/portal-proposal-url';
import { MemberUcaasProposal } from '@/components/member/MemberUcaasProposal';
import { MemberQuoteMerchantSavings } from '@/components/member/MemberQuoteMerchantSavings';
import { snapshotHasMerchantSavingsView } from '@/lib/quotes/merchant-quote-statement';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import { DocumentEmbed } from '@/components/admin/DocumentEmbed';
import { AcceptQuotePanel, QuoteAcceptProvider, QuoteAcceptedBanner } from '@/components/member/AcceptQuotePanel';

/** Member-facing published quote from a quote request. */
export function MemberQuoteProposal({
  snapshot,
  subject,
  onBack,
  quoteRequestId,
  contactName,
  contactEmail,
  contactPhone,
  allowAccept = true,
  onQuoteAccepted,
}: {
  snapshot: PublishedQuoteSnapshot;
  subject?: string;
  onBack: () => void;
  quoteRequestId?: string | null;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  allowAccept?: boolean;
  onQuoteAccepted?: () => void;
}) {
  const items = quoteItemsFromSnapshot(snapshot);
  const serviceLabel = subject ?? snapshot.serviceLabel;
  const acceptProviderProps = {
    quoteRequestId,
    onAccepted: onQuoteAccepted,
  };
  const acceptPanelProps = {
    serviceLabel,
    contactName,
    contactEmail,
    contactPhone,
  };

  if (items.length > 1) {
    return (
      <QuoteAcceptProvider {...acceptProviderProps}>
      <div className="proposal-analysis-embed">
        {allowAccept ? <QuoteAcceptedBanner serviceLabel={serviceLabel} /> : null}
        <div className="proposal-analysis-header">
          <div>
            <div className="proposal-analysis-eyebrow">Your quotes</div>
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
        <div className="member-quote-items-list">
          {items.map((item) => (
            <section key={item.id} className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">{item.label ?? 'Quote option'}</div>
              </div>
              <div className="card-body">
                {item.ucaasQuote ? (
                  <MemberUcaasProposal
                    snapshot={{
                      category: 'ucaas',
                      vendorName: snapshot.serviceLabel,
                      categoryLabel: snapshot.serviceLabel,
                      categoriesLabel: snapshot.serviceLabel,
                      ucaasQuote: item.ucaasQuote,
                      showSupplierName: item.showSupplierName ?? true,
                      publishedAt: snapshot.publishedAt ?? new Date().toISOString(),
                    }}
                    onBack={onBack}
                    allowAccept={false}
                  />
                ) : item.pricingStructureOptions?.some((o) => o.selected) ? (
                  <MemberQuoteMerchantSavings
                    snapshot={{
                      ...snapshot,
                      pricingStructureOptions: item.pricingStructureOptions,
                      matchedProviderName: item.matchedProviderName ?? snapshot.matchedProviderName,
                      matchedProviderSlug: item.matchedProviderSlug ?? snapshot.matchedProviderSlug,
                      showSupplierName: item.showSupplierName,
                      merchantQuote: item.merchantQuote ?? snapshot.merchantQuote,
                      quotePath: 'instant_merchant',
                    }}
                    subject={item.label ?? serviceLabel}
                    onBack={onBack}
                    allowAccept={false}
                    contactName={contactName}
                    contactEmail={contactEmail}
                    contactPhone={contactPhone}
                  />
                ) : (() => {
                  const doc = item.proposalDocument;
                  const proposalUrl = portalQuoteProposalUrl(quoteRequestId, doc);
                  if (proposalUrl && doc) {
                    return (
                      <DocumentEmbed
                        url={proposalUrl}
                        title={doc.name}
                        filename={doc.name}
                        mimeType={doc.mimeType ?? 'application/pdf'}
                      />
                    );
                  }
                  if (item.responseQuote?.excerpt) {
                    return (
                      <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{item.responseQuote.excerpt}</p>
                    );
                  }
                  return <p className="text-muted">Pricing details from your Candid specialist.</p>;
                })()}
              </div>
            </section>
          ))}
        </div>
        {allowAccept ? (
          <AcceptQuotePanel {...acceptPanelProps} />
        ) : null}
      </div>
      </QuoteAcceptProvider>
    );
  }

  if (snapshot.quotePath === 'instant_merchant' && snapshotHasMerchantSavingsView(snapshot)) {
    return (
      <MemberQuoteMerchantSavings
        snapshot={snapshot}
        subject={serviceLabel}
        onBack={onBack}
        allowAccept={allowAccept}
        onQuoteAccepted={onQuoteAccepted}
        quoteRequestId={quoteRequestId}
        contactName={contactName}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
      />
    );
  }

  if (items.length === 1) {
    const only = items[0]!;
    if (only.ucaasQuote) {
      const analysisShape: PublishedAnalysisSnapshot = {
        category: 'ucaas',
        vendorName: snapshot.serviceLabel,
        categoryLabel: snapshot.serviceLabel,
        categoriesLabel: snapshot.serviceLabel,
        adminMessage: snapshot.adminMessage,
        ucaasQuote: only.ucaasQuote,
        showSupplierName: only.showSupplierName ?? true,
        publishedAt: snapshot.publishedAt ?? new Date().toISOString(),
      };
      return (
        <MemberUcaasProposal
          snapshot={analysisShape}
          onBack={onBack}
          allowAccept={allowAccept}
          onQuoteAccepted={onQuoteAccepted}
          quoteRequestId={quoteRequestId}
          contactName={contactName}
          contactEmail={contactEmail}
          contactPhone={contactPhone}
        />
      );
    }
  }

  if (snapshotHasMerchantSavingsView(snapshot)) {
    return (
      <MemberQuoteMerchantSavings
        snapshot={{ ...snapshot, quotePath: 'instant_merchant' }}
        subject={serviceLabel}
        onBack={onBack}
        allowAccept={allowAccept}
        onQuoteAccepted={onQuoteAccepted}
        quoteRequestId={quoteRequestId}
        contactName={contactName}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
      />
    );
  }

  if (snapshot.quotePath === 'instant_ucaas' && snapshot.ucaasQuote) {
    const analysisShape: PublishedAnalysisSnapshot = {
      category: 'ucaas',
      vendorName: snapshot.serviceLabel,
      categoryLabel: snapshot.serviceLabel,
      categoriesLabel: snapshot.serviceLabel,
      adminMessage: snapshot.adminMessage,
      ucaasQuote: snapshot.ucaasQuote,
      showSupplierName: true,
      publishedAt: snapshot.publishedAt ?? new Date().toISOString(),
    };
    return (
      <MemberUcaasProposal
        snapshot={analysisShape}
        onBack={onBack}
        allowAccept={allowAccept}
        onQuoteAccepted={onQuoteAccepted}
        quoteRequestId={quoteRequestId}
        contactName={contactName}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
      />
    );
  }

  return (
    <QuoteAcceptProvider {...acceptProviderProps}>
    <div className="proposal-analysis-embed">
      {allowAccept ? <QuoteAcceptedBanner serviceLabel={serviceLabel} /> : null}
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

      {(() => {
        const doc = snapshot.proposalDocument;
        const proposalUrl = portalQuoteProposalUrl(quoteRequestId, doc);
        if (proposalUrl && doc) {
          return (
            <DocumentEmbed
              url={proposalUrl}
              title={doc.name}
              filename={doc.name}
              mimeType={doc.mimeType ?? 'application/pdf'}
              emptyMessage="Quote document will appear here."
            />
          );
        }
        return (
          <div className="msp-callout msp-callout--info">
            Your Candid specialist will follow up with pricing details. Check Message Center for updates.
          </div>
        );
      })()}

      {allowAccept ? (
        <AcceptQuotePanel {...acceptPanelProps} />
      ) : null}
    </div>
    </QuoteAcceptProvider>
  );
}
