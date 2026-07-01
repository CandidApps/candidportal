'use client';

import React, { useRef, useState } from 'react';
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

type MemberSavingsOpportunitiesViewProps = {
  services: ServiceCardModel[];
  userId?: string;
  customerName?: string;
  customerEmail?: string;
  onBillUploaded: (file: File, productName: string) => void | Promise<void>;
  onOpenAnalysis: (snapshot: MerchantAnalysisSnapshot, serviceId?: string) => void;
  onOpenProposalAnalysis?: (
    snapshot: PublishedAnalysisSnapshot,
    reviewId: string,
    serviceId: string,
  ) => void;
  onOpenTicket?: (svc: ServiceCardModel) => void;
  onOpenServiceDetail?: (svc: ServiceCardModel) => void;
  onAddToMemberServices?: (svc: ServiceCardModel) => void | Promise<void>;
  pendingBillReview?: {
    reviewId?: string;
    vendorName: string;
    parseResult: BillParseResult;
    categories?: string[] | null;
  } | null;
  onDismissPendingBillReview?: () => void;
  onBillConfirmed?: () => void;
  onRequestReview?: (svc: ServiceCardModel) => void;
  isReviewRequested?: (svc: ServiceCardModel) => boolean;
};

function SavingsOpportunityRow({
  svc,
  onOpenAnalysis,
  onOpenProposalAnalysis,
  onOpenTicket,
  onOpenServiceDetail,
  onAddToMemberServices,
  onRequestReview,
  reviewRequested,
  showRequestReview,
  showSavingsPreview,
}: {
  svc: ServiceCardModel;
  onOpenAnalysis: (snapshot: MerchantAnalysisSnapshot, serviceId?: string) => void;
  onOpenProposalAnalysis?: (
    snapshot: PublishedAnalysisSnapshot,
    reviewId: string,
    serviceId: string,
  ) => void;
  onOpenTicket?: (svc: ServiceCardModel) => void;
  onOpenServiceDetail?: (svc: ServiceCardModel) => void;
  onAddToMemberServices?: (svc: ServiceCardModel) => void | Promise<void>;
  onRequestReview?: (svc: ServiceCardModel) => void;
  reviewRequested?: boolean;
  showRequestReview?: boolean;
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
        {onOpenTicket && (
          <button type="button" className="service-card-action-btn" onClick={() => onOpenTicket(svc)}>
            Open ticket
          </button>
        )}
        {showRequestReview && onRequestReview && (
          reviewRequested ? (
            <span className="service-card-action-btn" style={{ cursor: 'default', opacity: 0.75 }}>
              Review requested
            </span>
          ) : (
            <button type="button" className="service-card-action-btn primary" onClick={() => onRequestReview(svc)}>
              Request review
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

export function MemberSavingsOpportunitiesView({
  services,
  userId,
  customerName,
  customerEmail,
  onBillUploaded,
  onOpenAnalysis,
  onOpenProposalAnalysis,
  onOpenTicket,
  onOpenServiceDetail,
  onAddToMemberServices,
  pendingBillReview,
  onDismissPendingBillReview,
  onBillConfirmed,
  onRequestReview,
  isReviewRequested,
}: MemberSavingsOpportunitiesViewProps) {
  const [productName, setProductName] = useState('');
  const [uploadStep, setUploadStep] = useState<'supplier' | 'upload'>('supplier');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <>
      <div className="greeting">
        <p>
          Submit bills for services not yet with Candid. We&apos;ll analyze them here — add any you want to track under
          My Services when you&apos;re ready.
        </p>
      </div>

      {readyToReview.length > 0 && (
        <div className="card savings-ready-card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div className="card-title">
              <span className="savings-ready-badge">Ready</span>
              {readyToReview.length === 1
                ? 'Your savings quote is ready'
                : `${readyToReview.length} savings quotes are ready`}
            </div>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 0, marginBottom: 14, lineHeight: 1.55 }}>
              Candid has finished {readyToReview.length === 1 ? 'reviewing this bill' : 'reviewing these bills'}. Open
              your analysis below to see exactly where you can save.
            </p>
            {readyToReview.map((s) => (
              <SavingsOpportunityRow
                key={s.id}
                svc={s}
                onOpenAnalysis={onOpenAnalysis}
                onOpenProposalAnalysis={onOpenProposalAnalysis}
                onOpenTicket={onOpenTicket}
                onOpenServiceDetail={onOpenServiceDetail}
                onAddToMemberServices={onAddToMemberServices}
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
                marginBottom: 16,
                lineHeight: 1.45,
              }}
            >
              Who is your current supplier you would like us to analyze?
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
                  goToUploadStep();
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
            <button type="button" className="login-btn" style={{ maxWidth: 200 }} onClick={goToUploadStep}>
              Next →
            </button>
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
              }}
            >
              Change supplier
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
                onOpenTicket={onOpenTicket}
                onOpenServiceDetail={onOpenServiceDetail}
                onAddToMemberServices={onAddToMemberServices}
                onRequestReview={onRequestReview}
                reviewRequested={isReviewRequested?.(s)}
                showRequestReview
              />
            ))}
          </div>
        </div>
      )}

      {services.length === 0 && !uploading && uploadStep === 'supplier' && (
        <div className="card">
          <div className="card-body" style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.55 }}>
            No savings opportunities yet. Upload a bill above to get started.
          </div>
        </div>
      )}
    </>
  );
}
