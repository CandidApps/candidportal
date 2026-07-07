'use client';

import type { CSSProperties } from 'react';
import { CandidIQMark } from '@/components/brand/CandidIQMark';
import { MaskedBrandLogo } from '@/components/brand/MaskedBrandLogo';

const ICON_HEIGHT = {
  login: 40,
  sb: 28,
  prospect: 30,
} as const;

const WORDMARK_HEIGHT = {
  login: 36,
  sb: 24,
  prospect: 28,
} as const;

const WHITE_LOCKUP_HEIGHT = {
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
};

/**
 * CandidIQ brand logos (theme-aware SVG):
 * - white lockup on login
 * - icon mark when sidebar is collapsed
 * - wordmark when sidebar is expanded
 */
export function CandidLogo({ size = 'sb', compact = false, variant = 'default' }: CandidLogoProps) {
  const iconH = ICON_HEIGHT[size];
  const wordH = WORDMARK_HEIGHT[size];

  if (variant === 'white' && !compact) {
    const h = WHITE_LOCKUP_HEIGHT[size];
    return (
      <MaskedBrandLogo
        className={['candid-logo', 'candid-logo--lockup', 'candid-logo--white', `candid-logo--${size}`].join(' ')}
        viewBox="0 0 300 50"
        singleLayer
        primaryMask="/brand/masks/lockup-primary.png"
        style={{ height: h } as CSSProperties}
        title="CandidIQ"
      />
    );
  }

  if (compact) {
    return (
      <CandidIQMark
        className={['candid-logo', 'candid-logo--icon', `candid-logo--${size}`, 'candid-logo--compact'].join(' ')}
        style={{ height: iconH } as CSSProperties}
      />
    );
  }

  return (
    <MaskedBrandLogo
      className={['candid-logo', 'candid-logo--wordmark', `candid-logo--${size}`].join(' ')}
      viewBox="0 0 300 47"
      primaryMask="/brand/masks/wordmark-primary.png"
      accentMask="/brand/masks/wordmark-accent.png"
      style={{ height: wordH } as CSSProperties}
      title="CandidIQ"
    />
  );
}
