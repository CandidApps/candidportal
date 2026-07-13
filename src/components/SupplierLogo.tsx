'use client';

import { useState } from 'react';
import {
  resolveSupplierLogo,
  supplierFaviconUrl,
  type SupplierLogoInfo,
} from '@/lib/supplier-logos';

type SupplierLogoProps = {
  vendor?: string | null;
  serviceName?: string | null;
  /** Optional website/domain — used for favicon when brand list doesn't match. */
  website?: string | null;
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
  logoKey,
  className,
  size = 44,
  variant = 'card',
}: SupplierLogoProps) {
  const info = resolveSupplierLogo(vendor, serviceName, website);
  const resolvedKey = logoKey && logoKey !== 'msp' ? logoKey : info.key;
  const [imgFailed, setImgFailed] = useState(false);

  if (info.domain && !imgFailed) {
    const baseClass = variant === 'card' ? 'sc-logo' : 'vendor-logo';
    return (
      <div
        className={`${baseClass} supplier-logo-img-wrap ${resolvedKey}${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size }}
      >
        <img
          src={supplierFaviconUrl(info.domain, 64)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
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
