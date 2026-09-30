'use client';

import { useEffect } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';

const REDIRECT_DELAY_MS = 2500;

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Rakuten-style "cash back activated" screen, then forwards to the supplier's referral link. */
export function ReferralRedirect({
  destination,
  supplierName,
  supplierWebsite,
  supplierLogoUrl,
  cashBack,
  termsUrl,
  staffPreview,
}: {
  destination: string;
  supplierName: string;
  supplierWebsite?: string;
  supplierLogoUrl?: string;
  cashBack: string | null;
  termsUrl?: string;
  staffPreview: boolean;
}) {
  useEffect(() => {
    if (staffPreview) return;
    const t = window.setTimeout(() => window.location.replace(destination), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [destination, staffPreview]);

  return (
    <main className="referral-go">
      <div className="referral-go-card">
        <div className="referral-go-logo">
          <SupplierLogo vendor={supplierName} website={supplierWebsite} logoUrl={supplierLogoUrl} size={72} />
        </div>
        <h1 className="referral-go-title">
          {cashBack ? `${titleCase(cashBack)} Activated` : `You're heading to ${supplierName}`}
        </h1>
        {cashBack && <p className="referral-go-sub">at {supplierName}</p>}
        <p className="referral-go-note">
          Please make sure to order through this link/browser to ensure your cash back is applied.
        </p>
        {termsUrl && (
          <a className="referral-go-link" href={termsUrl} target="_blank" rel="noreferrer">
            See all Terms &amp; Exclusions <AppIcon name="external" size={11} />
          </a>
        )}
        {staffPreview ? (
          <p className="referral-go-preview">
            Staff preview — this click wasn’t recorded and you won’t be redirected automatically.
          </p>
        ) : (
          <p className="referral-go-wait">Taking you to {supplierName}…</p>
        )}
        <a className="btn-primary referral-go-continue" href={destination} rel="noreferrer">
          Continue to {supplierName}
        </a>
      </div>
    </main>
  );
}
