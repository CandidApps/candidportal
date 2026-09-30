'use client';

import { SupplierLogo } from '@/components/SupplierLogo';
import { DEFAULT_CAMPAIGN_CTA } from '@/lib/incentive-campaigns';
import { formatPromoExpiry } from '@/lib/member-promos';

export type PromoSlideContent = {
  supplierName: string;
  supplierWebsite?: string;
  supplierLogoUrl?: string;
  title: string;
  details?: string;
  endsOn?: string;
  ctaLabel?: string;
  bannerImageUrl?: string;
};

/** One Find Solutions promo slide. Supplier logo always shows; banner image is optional. */
export function PromoSlide({
  slide,
  onCta,
}: {
  slide: PromoSlideContent;
  onCta?: () => void;
}) {
  const hasImage = Boolean(slide.bannerImageUrl);
  return (
    <div className={`promo-slide${hasImage ? ' promo-slide--image' : ''}`}>
      <div className="promo-slide-copy">
        <div className="promo-slide-brand">
          <span className="promo-slide-logo">
            <SupplierLogo
              vendor={slide.supplierName}
              website={slide.supplierWebsite}
              logoUrl={slide.supplierLogoUrl}
              size={36}
            />
          </span>
          <span className="promo-slide-supplier">{slide.supplierName}</span>
          <span className="promo-slide-pill">Limited promo</span>
        </div>
        <div className="promo-slide-title">{slide.title || 'Promo headline'}</div>
        {slide.details ? <p className="promo-slide-details">{slide.details}</p> : null}
        <div className="promo-slide-footer">
          <button type="button" className="btn-primary promo-slide-cta" onClick={onCta}>
            {slide.ctaLabel?.trim() || DEFAULT_CAMPAIGN_CTA}
          </button>
          {slide.endsOn ? (
            <span className="promo-slide-ends">Ends {formatPromoExpiry(slide.endsOn)}</span>
          ) : null}
        </div>
      </div>
      {hasImage ? (
        <div className="promo-slide-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.bannerImageUrl} alt="" />
        </div>
      ) : null}
    </div>
  );
}
