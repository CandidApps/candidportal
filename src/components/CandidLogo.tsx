'use client';

import type { CSSProperties } from 'react';

const LOGO_SRC = {
  full: '/brand/full-logo.svg',
  wordmarkPrimary: '/brand/only-words-primary.svg',
  wordmarkAccent: '/brand/only-words-accent.svg',
  icon: '/brand/sidebar-minimized.svg',
} as const;

const LOGO_ASPECT = {
  full: 804.74 / 136.66,
  wordmark: 674.1 / 136.66,
  icon: 105 / 94.29,
} as const;

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
};

function SvgMaskLogo({
  src,
  aspect,
  height,
  className,
  fill = 'var(--brand-logo-primary)',
  align = 'left',
  absolute = false,
  title = 'CandidIQ',
}: {
  src: string;
  aspect: number;
  height: number;
  className?: string;
  fill?: string;
  align?: 'left' | 'center';
  absolute?: boolean;
  title?: string;
}) {
  const width = Math.round(height * aspect * 100) / 100;
  const maskPos = align === 'center' ? 'center center' : 'left center';

  return (
    <span
      role="img"
      aria-label={title}
      className={className}
      style={
        {
          display: 'block',
          flexShrink: 0,
          height,
          width,
          backgroundColor: fill,
          maskImage: `url(${src})`,
          WebkitMaskImage: `url(${src})`,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskPosition: maskPos,
          WebkitMaskPosition: maskPos,
          ...(absolute
            ? { position: 'absolute', inset: 0, width: '100%', height: '100%' }
            : null),
        } as CSSProperties
      }
    />
  );
}

function WordmarkLogo({
  height,
  className,
}: {
  height: number;
  className: string;
}) {
  const width = Math.round(height * LOGO_ASPECT.wordmark * 100) / 100;
  return (
    <span
      className={['candid-logo-wordmark-stack', className].join(' ')}
      style={{ position: 'relative', display: 'block', height, width, flexShrink: 0 }}
      aria-hidden
    >
      <SvgMaskLogo
        src={LOGO_SRC.wordmarkPrimary}
        aspect={LOGO_ASPECT.wordmark}
        height={height}
        fill="var(--brand-logo-primary)"
        align="left"
        absolute
      />
      <SvgMaskLogo
        src={LOGO_SRC.wordmarkAccent}
        aspect={LOGO_ASPECT.wordmark}
        height={height}
        fill="var(--brand-logo-accent)"
        align="left"
        absolute
      />
    </span>
  );
}

/**
 * CandidIQ brand logos (vector SVG masks — sharp at any size, theme via CSS vars):
 * - full lockup on login
 * - wordmark when sidebar is expanded (primary + accent)
 * - icon mark when sidebar is collapsed (accent)
 */
export function CandidLogo({ size = 'sb', compact = false, variant = 'default' }: CandidLogoProps) {
  if (variant === 'white' && !compact) {
    return (
      <SvgMaskLogo
        src={LOGO_SRC.full}
        aspect={LOGO_ASPECT.full}
        height={FULL_LOCKUP_HEIGHT[size]}
        className={['candid-logo', 'candid-logo--lockup', 'candid-logo--white', `candid-logo--${size}`].join(' ')}
        fill="var(--login-fg)"
        align="left"
      />
    );
  }

  if (compact) {
    return (
      <SvgMaskLogo
        src={LOGO_SRC.icon}
        aspect={LOGO_ASPECT.icon}
        height={ICON_HEIGHT[size]}
        className={['candid-logo', 'candid-logo--icon', `candid-logo--${size}`, 'candid-logo--compact'].join(' ')}
        fill="var(--brand-logo-accent)"
        align="center"
      />
    );
  }

  return (
    <WordmarkLogo
      height={WORDMARK_HEIGHT[size]}
      className={['candid-logo', 'candid-logo--wordmark', `candid-logo--${size}`].join(' ')}
    />
  );
}
