'use client';

import { useState } from 'react';
import {
  resolveSupplierLogo,
  resolveSupplierLogoByKey,
  supplierFaviconUrl,
  type SupplierLogoInfo,
} from '@/lib/supplier-logos';

type SupplierLogoProps = {
  vendor?: string | null;
  serviceName?: string | null;
  /** Optional website/domain — used for favicon when brand list doesn't match. */
  website?: string | null;
  /** Admin-uploaded logo URL — preferred over favicon/brand lookup. */
  logoUrl?: string | null;
  logoKey?: string;
  className?: string;
  size?: number;
  variant?: 'card' | 'row';
  /**
   * Fallback when no usable image:
   * - initials (default) — up to 2 letters
   * - letter — first character of the company/vendor name
   */
  monogram?: 'initials' | 'letter';
};

function letterFromLabel(label: string): string {
  const cleaned = label.replace(/[^a-zA-Z0-9]/g, '').trim();
  if (cleaned) return cleaned.charAt(0).toUpperCase();
  const any = label.trim().charAt(0);
  return any ? any.toUpperCase() : '?';
}

function LogoFallback({
  info,
  className,
  size,
  variant,
  monogram,
  label,
}: {
  info: SupplierLogoInfo;
  className?: string;
  size: number;
  variant: 'card' | 'row';
  monogram: 'initials' | 'letter';
  label: string;
}) {
  const baseClass = variant === 'card' ? 'sc-logo' : 'vendor-logo';
  const text = monogram === 'letter' ? letterFromLabel(label || info.initials) : info.initials;
  return (
    <div
      className={`${baseClass} ${info.key}${className ? ` ${className}` : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * (monogram === 'letter' ? 0.42 : 0.28))),
      }}
      aria-hidden
    >
      {text}
    </div>
  );
}

/** Google returns a tiny default globe (~16×16) when the domain has no favicon. */
function isDefaultFaviconGlobe(img: HTMLImageElement): boolean {
  return img.naturalWidth > 0 && img.naturalWidth <= 16 && img.naturalHeight <= 16;
}

export function SupplierLogo({
  vendor,
  serviceName,
  website,
  logoUrl,
  logoKey,
  className,
  size = 44,
  variant = 'card',
  monogram = 'initials',
}: SupplierLogoProps) {
  const keyed = resolveSupplierLogoByKey(logoKey);
  const info = keyed ?? resolveSupplierLogo(vendor, serviceName, website);
  const resolvedKey = keyed?.key || (logoKey && logoKey !== 'msp' ? logoKey : info.key);
  const label = (vendor || serviceName || '').trim() || info.initials;
  const [customFailed, setCustomFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const customUrl = logoUrl?.trim() || null;
  const localUrl = info.localIconUrl?.trim() || null;
  const [localFailed, setLocalFailed] = useState(false);

  const fallback = (
    <LogoFallback
      info={{ ...info, key: resolvedKey }}
      className={className}
      size={size}
      variant={variant}
      monogram={monogram}
      label={label}
    />
  );

  if (customUrl && !customFailed) {
    const baseClass = variant === 'card' ? 'sc-logo' : 'vendor-logo';
    return (
      <div
        className={`${baseClass} supplier-logo-img-wrap ${resolvedKey}${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size }}
      >
        <img
          src={customUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setCustomFailed(true)}
        />
      </div>
    );
  }

  if (localUrl && !localFailed) {
    const baseClass = variant === 'card' ? 'sc-logo' : 'vendor-logo';
    return (
      <div
        className={`${baseClass} supplier-logo-img-wrap ${resolvedKey}${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size }}
      >
        <img
          src={localUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setLocalFailed(true)}
        />
      </div>
    );
  }

  if (info.domain && !faviconFailed) {
    const baseClass = variant === 'card' ? 'sc-logo' : 'vendor-logo';
    // Always request max Google size (128) so retina / card displays stay sharp.
    const faviconSrc = supplierFaviconUrl(info.domain, 128);
    return (
      <div
        className={`${baseClass} supplier-logo-img-wrap ${resolvedKey}${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size, padding: size <= 40 ? 2 : 4 }}
      >
        <img
          src={faviconSrc}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFaviconFailed(true)}
          onLoad={(e) => {
            if (isDefaultFaviconGlobe(e.currentTarget)) setFaviconFailed(true);
          }}
        />
      </div>
    );
  }

  return fallback;
}
