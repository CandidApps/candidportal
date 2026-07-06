'use client';

import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import { quoteItemsFromSnapshot } from '@/lib/quotes/quote-items';
import { MemberUcaasProposal } from '@/components/member/MemberUcaasProposal';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import { DocumentEmbed } from '@/components/admin/DocumentEmbed';

/** Member-facing published quote from a quote request. */
export function MemberQuoteProposal({
  snapshot,
  subject,
  onBack,
}: {
  snapshot: PublishedQuoteSnapshot;
  subject?: string;
  onBack: () => void;
}) {
  const items = quoteItemsFromSnapshot(snapshot);

  if (items.length > 1) {
    return (
      <div className="proposal-analysis-embed">
        <div className="proposal-analysis-header">
          <div>
            <div className="proposal-analysis-eyebrow">Your quotes</div>
            <h2 className="proposal-analysis-title">{subject ?? snapshot.serviceLabel}</h2>
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
                  />
                ) : item.proposalDocument?.url ? (
                  <DocumentEmbed
                    url={item.proposalDocument.url}
                    title={item.proposalDocument.name}
                    filename={item.proposalDocument.name}
                    mimeType={item.proposalDocument.mimeType ?? 'application/pdf'}
                  />
                ) : item.responseQuote?.excerpt ? (
                  <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{item.responseQuote.excerpt}</p>
                ) : (
                  <p className="text-muted">Pricing details from your Candid specialist.</p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
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
    return <MemberUcaasProposal snapshot={analysisShape} onBack={onBack} />;
  }

  return (
    <div className="proposal-analysis-embed">
      <div className="proposal-analysis-header">
        <div>
          <div className="proposal-analysis-eyebrow">Your quote</div>
          <h2 className="proposal-analysis-title">{subject ?? snapshot.serviceLabel}</h2>
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

      {snapshot.proposalDocument?.url ? (
        <DocumentEmbed
          url={snapshot.proposalDocument.url}
          title={snapshot.proposalDocument.name}
          filename={snapshot.proposalDocument.name}
          mimeType={snapshot.proposalDocument.mimeType ?? 'application/pdf'}
          emptyMessage="Quote document will appear here."
        />
      ) : (
        <div className="msp-callout msp-callout--info">
          Your Candid specialist will follow up with pricing details. Check Message Center for updates.
        </div>
      )}
    </div>
  );
}
