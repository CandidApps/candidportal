'use client';

import type { CSSProperties } from 'react';
import { MaskedBrandLogo } from '@/components/brand/MaskedBrandLogo';

const LOGO_VIEWBOX = {
  full: '0 0 804.74 136.66',
  wordmark: '0 0 674.1 136.66',
  icon: '0 0 105 94.29',
} as const;

const LOGO_MASK = {
  fullPrimary: '/brand/full-logo-primary.svg',
  fullAccent: '/brand/full-logo-accent.svg',
  wordmarkPrimary: '/brand/only-words-primary.svg',
  wordmarkAccent: '/brand/only-words-accent.svg',
  icon: '/brand/sidebar-minimized.svg',
} as const;

const ICON_HEIGHT = {
  login: 40,
  sb: 28,
  prospect: 30,
} as const;

const WORDMARK_HEIGHT = {
  login: 36,
  sb: 25,
  prospect: 28,
} as const;

const FULL_LOCKUP_HEIGHT = {
  login: 44,
  sb: 32,
  prospect: 36,
} as const;

export type CandidLogoSize = keyof typeof ICON_HEIGHT;

type CandidLogoProps = {
  size?: CandidLogoSize;
  /** Icon mark only (collapsed sidebar). */
  compact?: boolean;
  /** High-contrast lockup for dark backgrounds (e.g. login hero). */
  variant?: 'default' | 'white';
  /** Full icon + wordmark lockup (login / marketing). Default is wordmark-only. */
  lockup?: boolean;
};

/**
 * CandidIQ brand logos (vector SVG masks — sharp at any size, theme via CSS vars):
 * - full lockup on login / marketing (icon + wordmark, primary text + accent IQ)
 * - wordmark when sidebar is expanded (primary + accent)
 * - icon mark when sidebar is collapsed (accent)
 */
export function CandidLogo({
  size = 'sb',
  compact = false,
  variant = 'default',
  lockup = false,
}: CandidLogoProps) {
  if ((variant === 'white' || lockup) && !compact) {
    return (
      <MaskedBrandLogo
        className={[
          'candid-logo',
          'candid-logo--lockup',
          variant === 'white' ? 'candid-logo--white' : '',
          `candid-logo--${size}`,
        ]
          .filter(Boolean)
          .join(' ')}
        viewBox={LOGO_VIEWBOX.full}
        primaryMask={LOGO_MASK.fullPrimary}
        accentMask={LOGO_MASK.fullAccent}
        primaryFill={variant === 'white' ? 'var(--login-fg)' : undefined}
        style={{ height: FULL_LOCKUP_HEIGHT[size] } as CSSProperties}
        title="CandidIQ"
      />
    );
  }

  if (compact) {
    return (
      <MaskedBrandLogo
        className={['candid-logo', 'candid-logo--icon', `candid-logo--${size}`, 'candid-logo--compact'].join(' ')}
        viewBox={LOGO_VIEWBOX.icon}
        singleLayer
        primaryMask={LOGO_MASK.icon}
        primaryFill="var(--brand-logo-accent)"
        style={{ height: ICON_HEIGHT[size] } as CSSProperties}
        title="CandidIQ"
      />
    );
  }

  return (
    <MaskedBrandLogo
      className={['candid-logo', 'candid-logo--wordmark', `candid-logo--${size}`].join(' ')}
      viewBox={LOGO_VIEWBOX.wordmark}
      primaryMask={LOGO_MASK.wordmarkPrimary}
      accentMask={LOGO_MASK.wordmarkAccent}
      style={{ height: WORDMARK_HEIGHT[size] } as CSSProperties}
      title="CandidIQ"
    />
  );
}
