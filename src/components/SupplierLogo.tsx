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
};

function LogoFallback({
  info,
  className,
  size,
  variant,
}: {
  info: SupplierLogoInfo;
  className?: string;
  size: number;
  variant: 'card' | 'row';
}) {
  const baseClass = variant === 'card' ? 'sc-logo' : 'vendor-logo';
  return (
    <div
      className={`${baseClass} ${info.key}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.28)) }}
      aria-hidden
    >
      {info.initials}
    </div>
  );
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
}: SupplierLogoProps) {
  const keyed = resolveSupplierLogoByKey(logoKey);
  const info = keyed ?? resolveSupplierLogo(vendor, serviceName, website);
  const resolvedKey = keyed?.key || (logoKey && logoKey !== 'msp' ? logoKey : info.key);
  const [customFailed, setCustomFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const customUrl = logoUrl?.trim() || null;
  const localUrl = info.localIconUrl?.trim() || null;
  const [localFailed, setLocalFailed] = useState(false);

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
    return (
      <div
        className={`${baseClass} supplier-logo-img-wrap ${resolvedKey}${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size }}
      >
        <img
          src={supplierFaviconUrl(info.domain, Math.max(64, size * 2))}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFaviconFailed(true)}
        />
      </div>
    );
  }

  return (
    <LogoFallback
      info={{ ...info, key: resolvedKey }}
      className={className}
      size={size}
      variant={variant}
    />
  );
}
