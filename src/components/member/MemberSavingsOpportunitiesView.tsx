'use client';

import React, { useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { ServiceCardModel } from '@/lib/services/account-services';
import type { MerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';
import { billFingerprint, isDuplicateBill } from '@/lib/services/bill-fingerprints';

type MemberSavingsOpportunitiesViewProps = {
  services: ServiceCardModel[];
  userId?: string;
  onBillUploaded: (file: File, productName: string) => void | Promise<void>;
  onOpenAnalysis: (snapshot: MerchantAnalysisSnapshot, serviceId?: string) => void;
};

export function MemberSavingsOpportunitiesView({
  services,
  userId,
  onBillUploaded,
  onOpenAnalysis,
}: MemberSavingsOpportunitiesViewProps) {
  const [productName, setProductName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const withAnalysis = services.filter((s) => s.merchantAnalysis);

  const handleFile = async (file: File) => {
    const name = productName.trim() || file.name.replace(/\.[^.]+$/, '');
    if (!name) {
      setError('Enter a vendor or service name before uploading.');
      return;
    }
    if (userId) {
      const fp = await billFingerprint(file);
      if (await isDuplicateBill(userId, fp)) {
        setError('This bill looks like one you already submitted. Open it from My Services or upload a different statement.');
        return;
      }
    }
    setError('');
    setUploading(true);
    try {
      await onBillUploaded(file, name);
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'duplicate'
          ? 'This bill matches one you already uploaded. Open it from My Services or upload a different statement.'
          : err instanceof Error
            ? err.message
            : 'Upload failed. Please try again.'
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
          Submit bills for services not yet with Candid. We&apos;ll analyze them and show where you can save.
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
            Vendor / service name
          </label>
          <input
            id="savings-product-name"
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g. Square, Vonage, Comcast Business"
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
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop a bill to analyze savings</div>
        <div style={{ fontSize: 12, color: 'var(--gray)' }}>PDF or image · duplicate bills are detected automatically</div>
        <button
          type="button"
          className="login-btn"
          style={{ marginTop: 16, maxWidth: 280 }}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Analyzing…' : 'Choose file'}
        </button>
        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 12 }}>{error}</div>}
      </div>

      {withAnalysis.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent analyses</div>
          </div>
          <div className="card-body">
            {withAnalysis.map((s) => (
              <div
                key={s.id}
                className="svc-row svc-row-clickable"
                role="button"
                tabIndex={0}
                onClick={() => s.merchantAnalysis && onOpenAnalysis(s.merchantAnalysis, s.id)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && s.merchantAnalysis) {
                    e.preventDefault();
                    onOpenAnalysis(s.merchantAnalysis, s.id);
                  }
                }}
              >
                <div className="svc-left">
                  <div className={`vendor-logo ${s.logo}`}>{s.logoTxt}</div>
                  <div>
                    <div className="svc-name">{s.name}</div>
                    <div className="svc-vendor">{s.vendor}</div>
                  </div>
                </div>
                <div className="svc-right">
                  <div className="svc-amount">{s.amount ?? '—'}/mo</div>
                  <div className="svc-exp ok">View analysis →</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
