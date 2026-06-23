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

type MemberSavingsOpportunitiesViewProps = {
  services: ServiceCardModel[];
  userId?: string;
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
    vendorName: string;
    parseResult: BillParseResult;
    categories?: string[] | null;
  } | null;
  onDismissPendingBillReview?: () => void;
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

  const openAnalysis = () => {
    if (snapshot) onOpenAnalysis(snapshot, svc.id);
    else if (hasProposal && proposalSnapshot && proposalReviewId) {
      onOpenProposalAnalysis!(proposalSnapshot, proposalReviewId, svc.id);
    }
  };

  return (
    <div className="svc-row savings-opp-row">
      <div className="svc-left">
        <SupplierLogo vendor={svc.vendor} serviceName={svc.name} logoKey={svc.logo} size={36} variant="row" />
        <div>
          <div className="svc-name">{svc.name}</div>
          <div className="svc-vendor">{svc.pending ? svc.statusTxt : svc.vendor}</div>
        </div>
      </div>
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
  onBillUploaded,
  onOpenAnalysis,
  onOpenProposalAnalysis,
  onOpenTicket,
  onOpenServiceDetail,
  onAddToMemberServices,
  pendingBillReview,
  onDismissPendingBillReview,
  onRequestReview,
  isReviewRequested,
}: MemberSavingsOpportunitiesViewProps) {
  const [productName, setProductName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pendingReview = services.filter((s) => s.pending);
  const readyToReview = services.filter(
    (s) =>
      !s.pending &&
      (s.merchantAnalysis || (s.analysisSnapshot && s.analysisReviewId)),
  );

  const handleFile = async (file: File) => {
    const vendorName = productName.trim();
    if (!vendorName) {
      setError('Enter a vendor or service name before uploading your bill.');
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

  return (
    <>
      <div className="greeting">
        <h2>
          My <span style={{ color: 'var(--red)' }}>Savings Opportunities</span>
        </h2>
        <p>
          Submit bills for services not yet with Candid. We&apos;ll analyze them here — add any you want to track under
          My Services when you&apos;re ready.
        </p>
      </div>

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
        <div style={{ marginBottom: 12 }}>
          <label
            htmlFor="savings-product-name"
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--gray)',
              marginBottom: 6,
            }}
          >
            Vendor / service name <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(required)</span>
          </label>
          <input
            id="savings-product-name"
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g. Worldpay, RingCentral, Comcast Business"
            style={{
              width: '100%',
              maxWidth: 360,
              margin: '0 auto',
              display: 'block',
              border: '1px solid var(--gray-border)',
              borderRadius: 6,
              padding: '10px 12px',
              fontSize: 14,
            }}
          />
        </div>
        <div style={{ fontSize: 28, marginBottom: 8, color: 'var(--red)' }}>
          <AppIcon name="file" size={28} />
        </div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {uploading ? <AnalyzingDotsLabel prefix="Analyzing your bill" /> : 'Drop a bill to analyze savings'}
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

      {pendingBillReview && (
        <div style={{ marginBottom: 24 }}>
          <MemberBillPendingReview
            vendorName={pendingBillReview.vendorName}
            parseResult={pendingBillReview.parseResult}
            categories={pendingBillReview.categories}
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

      {readyToReview.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div className="card-title">Ready to review</div>
          </div>
          <div className="card-body">
            {readyToReview.map((s) => (
              <SavingsOpportunityRow
                key={s.id}
                svc={s}
                onOpenAnalysis={onOpenAnalysis}
                onOpenProposalAnalysis={onOpenProposalAnalysis}
                onOpenTicket={onOpenTicket}
                onOpenServiceDetail={onOpenServiceDetail}
                onAddToMemberServices={onAddToMemberServices}
              />
            ))}
          </div>
        </div>
      )}

      {services.length === 0 && !uploading && (
        <div className="card">
          <div className="card-body" style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.55 }}>
            No savings opportunities yet. Upload a bill above to get started.
          </div>
        </div>
      )}
    </>
  );
}
