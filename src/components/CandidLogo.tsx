'use client';

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
  /** White lockup for dark backgrounds (e.g. login hero). */
  variant?: 'default' | 'white';
};

/**
 * Official Candid logo: hex icon asset + wordmark asset (divider + CANDID).
 * Use variant="white" on dark backgrounds for the combined white lockup.
 */
export function CandidLogo({ size = 'sb', compact = false, variant = 'default' }: CandidLogoProps) {
  const iconH = ICON_HEIGHT[size];
  const wordH = WORDMARK_HEIGHT[size];

  if (variant === 'white' && !compact) {
    const h = WHITE_LOCKUP_HEIGHT[size];
    return (
      <img
        src="/brand/candid-logos-white.png"
        alt="Candid"
        className={['candid-logo-white', `candid-logo-white--${size}`].join(' ')}
        height={h}
        width={Math.round(h * (4467 / 913))}
        decoding="async"
      />
    );
  }

  return (
    <div
      className={['candid-logo', `candid-logo--${size}`, compact ? 'candid-logo--compact' : '']
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label="Candid"
    >
      <img
        src="/brand/candid-icon.png"
        alt=""
        className="candid-logo-icon"
        height={iconH}
        width={Math.round(iconH * (85 / 81))}
        decoding="async"
      />
      {!compact && (
        <img
          src="/brand/candid-wordmark.png"
          alt=""
          className="candid-logo-wordmark"
          height={wordH}
          width={Math.round(wordH * (376 / 111))}
          decoding="async"
        />
      )}
    </div>
  );
}
