'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnalyzingDotsLabel } from '@/components/AnalyzingDotsLabel';
import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';
import type { ServiceCardModel } from '@/lib/services/account-services';
import type { MerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';
import type { BillParseResult, PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import { MemberBillPendingReview } from '@/components/member/MemberBillPendingReview';
import { billFingerprint, isDuplicateBill } from '@/lib/services/bill-fingerprints';
import {
  quoteSavingsPreview,
  formatSavingsMoney,
  formatGeneratedDate,
} from '@/lib/services/quote-savings';

import {
  formatQuoteRequestTime,
  isQuoteRequestPending,
  isQuoteRequestPublished,
  resolveQuoteServiceLabel,
  type QuoteRequestRow,
} from '@/lib/services/quote-requests';
import type { NewQuoteFlowPrefill } from '@/components/member/NewQuoteFlowModal';
import { MemberPendingContractsPanel } from '@/components/member/MemberPendingContractsPanel';
import {
  clearSavedQuoteDraft,
  describeSavedQuoteDraft,
  loadSavedQuoteDraft,
  QUOTE_DRAFT_CHANGED_EVENT,
  type SavedQuoteDraft,
} from '@/lib/quote-draft-storage';
import { quoteServiceById } from '@/lib/quote-flow-config';

type MemberSavingsOpportunitiesViewProps = {
  services: ServiceCardModel[];
  quoteRequests?: QuoteRequestRow[];
  userId?: string;
  customerName?: string;
  customerEmail?: string;
  customerId?: string | null;
  onBillUploaded: (file: File, productName: string) => void | Promise<void>;
  onOpenManualQuote?: (prefill?: NewQuoteFlowPrefill) => void;
  onOpenPublishedQuote?: (quoteRequestId: string) => void;
  onOpenAnalysis: (snapshot: MerchantAnalysisSnapshot, serviceId?: string) => void;
  onOpenProposalAnalysis?: (
    snapshot: PublishedAnalysisSnapshot,
    reviewId: string,
    serviceId: string,
  ) => void;
  onGetHelp?: (svc: ServiceCardModel) => void;
  helpInProgress?: (svc: ServiceCardModel) => boolean;
  onOpenServiceDetail?: (svc: ServiceCardModel) => void;
  onAddToMemberServices?: (svc: ServiceCardModel) => void | Promise<void>;
  pendingBillReview?: {
    reviewId?: string;
    vendorName: string;
    parseResult: BillParseResult;
    categories?: string[] | null;
  } | null;
  onDismissPendingBillReview?: () => void;
  onCompletePendingBillReview?: () => void;
  onBillConfirmed?: () => void;
};

function SavingsOpportunityRow({
  svc,
  onOpenAnalysis,
  onOpenProposalAnalysis,
  onGetHelp,
  onOpenServiceDetail,
  onAddToMemberServices,
  helpInProgress,
  showSavingsPreview,
}: {
  svc: ServiceCardModel;
  onOpenAnalysis: (snapshot: MerchantAnalysisSnapshot, serviceId?: string) => void;
  onOpenProposalAnalysis?: (
    snapshot: PublishedAnalysisSnapshot,
    reviewId: string,
    serviceId: string,
  ) => void;
  onGetHelp?: (svc: ServiceCardModel) => void;
  onOpenServiceDetail?: (svc: ServiceCardModel) => void;
  onAddToMemberServices?: (svc: ServiceCardModel) => void | Promise<void>;
  helpInProgress?: boolean;
  showSavingsPreview?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const snapshot = svc.merchantAnalysis;
  const proposalSnapshot = svc.analysisSnapshot;
  const proposalReviewId = svc.analysisReviewId;
  const hasMerchantAnalysis = Boolean(snapshot);
  const hasProposal = Boolean(proposalSnapshot && proposalReviewId && onOpenProposalAnalysis);
  const hasDetail =
    Boolean(svc.contractId || svc.locationLabel) ||
    (!svc.candidManaged && !svc.id.startsWith('portal-'));

  const canOpen = hasMerchantAnalysis || hasProposal;
  const preview = showSavingsPreview ? quoteSavingsPreview(svc) : null;
  const generatedLabel = preview ? formatGeneratedDate(preview.generatedAt) : null;

  const openAnalysis = () => {
    if (snapshot) onOpenAnalysis(snapshot, svc.id);
    else if (hasProposal && proposalSnapshot && proposalReviewId) {
      onOpenProposalAnalysis!(proposalSnapshot, proposalReviewId, svc.id);
    }
  };

  return (
    <div
      className="svc-row savings-opp-row"
      onClick={canOpen ? openAnalysis : undefined}
      style={canOpen ? { cursor: 'pointer' } : undefined}
    >
      <div className="svc-left">
        <SupplierLogo vendor={svc.vendor} serviceName={svc.name} logoKey={svc.logo} size={36} variant="row" />
        <div>
          <div className="svc-name">{svc.name}</div>
          <div className="svc-vendor">
            {svc.pending ? svc.statusTxt : svc.vendor}
            {preview?.categoryLabel ? ` · ${preview.categoryLabel}` : ''}
            {generatedLabel ? ` · Analyzed ${generatedLabel}` : ''}
          </div>
        </div>
      </div>
      {preview && preview.monthly > 0 && (
        <div className="quote-savings-figure">
          <span className="quote-savings-amount">{formatSavingsMoney(preview.monthly)}/mo</span>
          <span className="quote-savings-sub">{formatSavingsMoney(preview.annual)} annually</span>
        </div>
      )}
      <div className="svc-right savings-opp-actions" onClick={(e) => e.stopPropagation()}>
        {(hasMerchantAnalysis || hasProposal) && (
          <button type="button" className="service-card-action-btn primary" onClick={openAnalysis}>
            View analysis
          </button>
        )}
        {hasDetail && onOpenServiceDetail && (
          <button type="button" className="service-card-action-btn" onClick={() => onOpenServiceDetail(svc)}>
            View details
          </button>
        )}
        {onGetHelp && (
          helpInProgress ? (
            <span className="service-card-action-btn" style={{ cursor: 'default', opacity: 0.75 }}>
              Help in progress
            </span>
          ) : (
            <button type="button" className="service-card-action-btn primary" onClick={() => onGetHelp(svc)}>
              Get help
            </button>
          )
        )}
        {onAddToMemberServices && (
          <button
            type="button"
            className="service-card-action-btn"
            disabled={adding}
            onClick={() => {
              setAdding(true);
              void Promise.resolve(onAddToMemberServices(svc)).finally(() => setAdding(false));
            }}
          >
            {adding ? 'Adding…' : 'Add as service not with Candid'}
          </button>
        )}
      </div>
    </div>
  );
}

type IntakeStep = 'supplier' | 'path' | 'upload';

function QuoteRequestHistoryRow({
  row,
  onOpenPublishedQuote,
}: {
  row: QuoteRequestRow;
  onOpenPublishedQuote?: (quoteRequestId: string) => void;
}) {
  const published = isQuoteRequestPublished(row);
  const pending = isQuoteRequestPending(row);
  const label = resolveQuoteServiceLabel(row);
  const vendors = row.vendor_names?.filter(Boolean).join(', ');
  const subtitle = [
    published ? 'Quote ready' : pending ? 'Submitted — Candid is preparing your quote' : 'Closed',
    vendors ? `Current: ${vendors}` : null,
    formatQuoteRequestTime(row.created_at),
  ]
    .filter(Boolean)
    .join(' · ');

  const open = () => {
    if (published && onOpenPublishedQuote) onOpenPublishedQuote(row.id);
  };

  return (
    <div
      className="svc-row savings-opp-row"
      onClick={published ? open : undefined}
      style={published ? { cursor: 'pointer' } : undefined}
    >
      <div className="svc-left">
        <div
          className="svc-logo-placeholder"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'var(--gray-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--red)',
          }}
        >
          <AppIcon name="reports" size={18} />
        </div>
        <div>
          <div className="svc-name">{row.subject ?? label}</div>
          <div className="svc-vendor">{subtitle}</div>
        </div>
      </div>
      <div className="svc-right savings-opp-actions" onClick={(e) => e.stopPropagation()}>
        {published ? (
          <button type="button" className="service-card-action-btn primary" onClick={open}>
            View quote
          </button>
        ) : pending ? (
          <span className="service-card-action-btn" style={{ cursor: 'default', opacity: 0.8 }}>
            In progress
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function MemberSavingsOpportunitiesView({
  services,
  quoteRequests = [],
  userId,
  customerName,
  customerEmail,
  customerId = null,
  onBillUploaded,
  onOpenManualQuote,
  onOpenPublishedQuote,
  onOpenAnalysis,
  onOpenProposalAnalysis,
  onGetHelp,
  onOpenServiceDetail,
  onAddToMemberServices,
  pendingBillReview,
  onDismissPendingBillReview,
  onCompletePendingBillReview,
  onBillConfirmed,
  helpInProgress,
}: MemberSavingsOpportunitiesViewProps) {
  const [productName, setProductName] = useState('');
  const [uploadStep, setUploadStep] = useState<IntakeStep>('supplier');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [savedDraft, setSavedDraft] = useState<SavedQuoteDraft | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => setSavedDraft(loadSavedQuoteDraft());
    refresh();
    window.addEventListener(QUOTE_DRAFT_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(QUOTE_DRAFT_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const goToPathStep = () => {
    const vendorName = productName.trim();
    if (!vendorName) {
      setError('Enter your current supplier name to continue.');
      return;
    }
    setError('');
    setUploadStep('path');
  };

  const openManualQuote = (vendorNames?: string[]) => {
    onOpenManualQuote?.(vendorNames?.length ? { vendorNames } : undefined);
    setProductName('');
    setUploadStep('supplier');
    setError('');
  };

  const goToUploadStep = () => {
    const vendorName = productName.trim();
    if (!vendorName) {
      setError('Enter your current supplier name to continue.');
      return;
    }
    setError('');
    setUploadStep('upload');
  };

  const handleFile = async (file: File) => {
    if (uploadStep !== 'upload') return;
    const vendorName = productName.trim();
    if (!vendorName) {
      setError('Enter your current supplier name to continue.');
      setUploadStep('supplier');
      return;
    }
    if (userId) {
      const fp = await billFingerprint(file);
      if (await isDuplicateBill(userId, fp)) {
        setError('This bill looks like one you already submitted. Open it below or upload a different statement.');
        return;
      }
    }
    setError('');
    setUploading(true);
    try {
      await onBillUploaded(file, vendorName);
      setProductName('');
      setUploadStep('supplier');
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'duplicate'
          ? 'This bill matches one you already uploaded. Open it below or upload a different statement.'
          : err instanceof Error
            ? err.message
            : 'Upload failed. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  const pendingReview = services.filter((s) => s.pending);
  const readyToReview = services.filter(
    (s) =>
      !s.pending &&
      (s.merchantAnalysis || (s.analysisSnapshot && s.analysisReviewId)),
  );
  const publishedQuoteRequests = quoteRequests.filter(isQuoteRequestPublished);
  const pendingQuoteRequests = quoteRequests.filter(isQuoteRequestPending);
  const historyQuoteRequests = quoteRequests.filter((r) => !isQuoteRequestPublished(r));
  const readyCount = readyToReview.length + publishedQuoteRequests.length;

  const draftServiceLabel = savedDraft
    ? quoteServiceById(savedDraft.draft.serviceTypeId)?.label ?? describeSavedQuoteDraft(savedDraft)
    : '';

  return (
    <>
      <div className="greeting">
        <p>
          Request quotes, upload bills to compare your current supplier, or start fresh for a new service. Everything
          you submit appears in your quote history below.
        </p>
      </div>

      <MemberPendingContractsPanel customerId={customerId} />

      {savedDraft && onOpenManualQuote ? (
        <div className="card nq-draft-card" style={{ marginBottom: 24 }}>
          <div className="card-body" style={{ padding: '18px 22px' }}>
            <div className="nq-draft-card-row">
              <div>
                <div className="nq-draft-card-badge">Draft</div>
                <div className="nq-draft-card-title">
                  {draftServiceLabel || 'Saved quote request'}
                </div>
                <p className="nq-muted" style={{ marginTop: 4 }}>
                  Saved{' '}
                  {new Date(savedDraft.savedAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {savedDraft.draft.company ? ` · ${savedDraft.draft.company}` : ''}
                  {savedDraft.draft.vendorNames.length
                    ? ` · ${savedDraft.draft.vendorNames.slice(0, 2).join(', ')}`
                    : ''}
                </p>
              </div>
              <div className="nq-draft-card-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    clearSavedQuoteDraft();
                    setSavedDraft(null);
                  }}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onOpenManualQuote({ resumeDraft: true })}
                >
                  Resume draft
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {readyCount > 0 && (
        <div className="card savings-ready-card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div className="card-title">
              <span className="savings-ready-badge">Ready</span>
              {readyCount === 1 ? 'Your quote is ready' : `${readyCount} quotes are ready`}
            </div>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 0, marginBottom: 14, lineHeight: 1.55 }}>
              Open your {readyCount === 1 ? 'quote' : 'quotes'} below to review what Candid prepared for you.
            </p>
            {publishedQuoteRequests.map((row) => (
              <QuoteRequestHistoryRow
                key={row.id}
                row={row}
                onOpenPublishedQuote={onOpenPublishedQuote}
              />
            ))}
            {readyToReview.map((s) => (
              <SavingsOpportunityRow
                key={s.id}
                svc={s}
                onOpenAnalysis={onOpenAnalysis}
                onOpenProposalAnalysis={onOpenProposalAnalysis}
                onGetHelp={onGetHelp}
                helpInProgress={helpInProgress?.(s)}
                showSavingsPreview
              />
            ))}
          </div>
        </div>
      )}

      {uploadStep === 'supplier' ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-body" style={{ padding: '24px 28px' }}>
            <p
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--gray-dark)',
                marginTop: 0,
                marginBottom: 8,
                lineHeight: 1.45,
              }}
            >
              Get a quote
            </p>
            <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 0, marginBottom: 16, lineHeight: 1.55 }}>
              Tell us about your current supplier to compare with a bill, or start a new-service quote if you don&apos;t
              have one yet.
            </p>
            <label
              htmlFor="savings-product-name"
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--gray)',
                marginBottom: 8,
              }}
            >
              Current supplier
            </label>
            <input
              id="savings-product-name"
              type="text"
              value={productName}
              onChange={(e) => {
                setProductName(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  goToPathStep();
                }
              }}
              placeholder="e.g. Worldpay, RingCentral, Comcast Business"
              style={{
                width: '100%',
                maxWidth: 420,
                border: '1px solid var(--gray-border)',
                borderRadius: 6,
                padding: '11px 14px',
                fontSize: 14,
                marginBottom: 16,
              }}
            />
            {error ? (
              <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</div>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button type="button" className="login-btn" style={{ maxWidth: 200 }} onClick={goToPathStep}>
                Next →
              </button>
              {onOpenManualQuote && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => openManualQuote()}
                >
                  I don&apos;t have a supplier yet / new service
                </button>
              )}
            </div>
          </div>
        </div>
      ) : uploadStep === 'path' ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-body" style={{ padding: '24px 28px' }}>
            <p
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--gray-dark)',
                marginTop: 0,
                marginBottom: 8,
              }}
            >
              How would you like to proceed?
            </p>
            <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 0, marginBottom: 20, lineHeight: 1.55 }}>
              Current supplier: <strong style={{ color: 'var(--gray-dark)' }}>{productName.trim()}</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
              <button type="button" className="login-btn" onClick={goToUploadStep}>
                Upload bill for analysis
              </button>
              {onOpenManualQuote && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => openManualQuote([productName.trim()])}
                >
                  Request quote without a bill
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setUploadStep('supplier');
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--red)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 13,
                  alignSelf: 'flex-start',
                  marginTop: 4,
                }}
              >
                ← Back
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`upload-zone${dragOver ? ' drag-over' : ''}`}
          style={{ marginBottom: 24 }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void handleFile(f);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
          <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--gray)' }}>
            Analyzing bill for{' '}
            <strong style={{ color: 'var(--gray-dark)' }}>{productName.trim()}</strong>
            {' · '}
            <button
              type="button"
              onClick={() => {
                setUploadStep('path');
                setError('');
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--red)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Change supplier
            </button>
            {' · '}
            <button
              type="button"
              onClick={() => {
                setUploadStep('path');
                setError('');
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--red)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Other options
            </button>
          </div>
          <div style={{ fontSize: 28, marginBottom: 8, color: 'var(--red)' }}>
            <AppIcon name="file" size={28} />
          </div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {uploading ? <AnalyzingDotsLabel prefix="Analyzing your bill" /> : 'Drop your bill here'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray)' }}>
            {uploading ? 'Hang tight — we are reading your statement' : 'PDF or image · duplicate bills are detected automatically'}
          </div>
          <button
            type="button"
            className="login-btn"
            style={{ marginTop: 16, maxWidth: 280 }}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <AnalyzingDotsLabel prefix="Analyzing" /> : 'Choose file'}
          </button>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 12 }}>{error}</div>}
        </div>
      )}

      {pendingBillReview && (
        <div style={{ marginBottom: 24 }}>
          <MemberBillPendingReview
            vendorName={pendingBillReview.vendorName}
            parseResult={pendingBillReview.parseResult}
            categories={pendingBillReview.categories}
            reviewId={pendingBillReview.reviewId}
            userId={userId}
            customerName={customerName}
            customerEmail={customerEmail}
            alreadySubmitted={Boolean(pendingBillReview.parseResult.customerConfirmation)}
            onSubmitted={onBillConfirmed}
            onBack={onDismissPendingBillReview}
            onComplete={onCompletePendingBillReview ?? onDismissPendingBillReview}
          />
        </div>
      )}

      {pendingReview.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div className="card-title">Submitted for review</div>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 0, marginBottom: 14, lineHeight: 1.55 }}>
              Our team is reviewing these bills. You&apos;ll be notified when your savings analysis is ready.
            </p>
            {pendingReview.map((s) => (
              <SavingsOpportunityRow
                key={s.id}
                svc={s}
                onOpenAnalysis={onOpenAnalysis}
                onOpenProposalAnalysis={onOpenProposalAnalysis}
                onGetHelp={onGetHelp}
                helpInProgress={helpInProgress?.(s)}
              />
            ))}
          </div>
        </div>
      )}

      {historyQuoteRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div className="card-title">Quote history</div>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 0, marginBottom: 14, lineHeight: 1.55 }}>
              Track quote requests you submitted from here or the dashboard.
            </p>
            {historyQuoteRequests.map((row) => (
              <QuoteRequestHistoryRow
                key={row.id}
                row={row}
                onOpenPublishedQuote={onOpenPublishedQuote}
              />
            ))}
          </div>
        </div>
      )}

      {pendingQuoteRequests.length > 0 && publishedQuoteRequests.length === 0 && readyToReview.length === 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-body" style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.55 }}>
            {pendingQuoteRequests.length === 1
              ? 'Your quote request was submitted. Candid will follow up within 48 hours.'
              : `${pendingQuoteRequests.length} quote requests are in progress.`}
          </div>
        </div>
      )}

      {services.length === 0 && quoteRequests.length === 0 && !uploading && uploadStep === 'supplier' && (
        <div className="card">
          <div className="card-body" style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.55 }}>
            No quotes yet. Use the form above to request a quote or upload a bill to get started.
          </div>
        </div>
      )}
    </>
  );
}
