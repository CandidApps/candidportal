'use client';

import { useId } from 'react';

type MaskedBrandLogoProps = {
  viewBox: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  /** Single-color lockup (login hero). */
  singleLayer?: boolean;
  primaryMask: string;
  accentMask?: string;
  primaryFill?: string;
  accentFill?: string;
};

function viewBoxSize(viewBox: string) {
  const parts = viewBox.trim().split(/\s+/).map(Number);
  return { width: parts[2] ?? 300, height: parts[3] ?? 50 };
}

/**
 * Themeable logo built from transparent alpha masks inside SVG.
 * Primary and accent fills follow --brand-logo-primary / --brand-logo-accent.
 */
export function MaskedBrandLogo({
  viewBox,
  className,
  style,
  title = 'CandidIQ',
  singleLayer = false,
  primaryMask,
  accentMask,
  primaryFill = 'var(--brand-logo-primary)',
  accentFill = 'var(--brand-logo-accent)',
}: MaskedBrandLogoProps) {
  const uid = useId().replace(/:/g, '');
  const { width, height } = viewBoxSize(viewBox);
  const primaryId = `brand-primary-${uid}`;
  const accentId = `brand-accent-${uid}`;

  return (
    <svg
      className={className}
      style={style}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      preserveAspectRatio="xMinYMid meet"
    >
      <title>{title}</title>
      <defs>
        <mask id={primaryId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <image href={primaryMask} x="0" y="0" width={width} height={height} />
        </mask>
        {!singleLayer && accentMask ? (
          <mask id={accentId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <image href={accentMask} x="0" y="0" width={width} height={height} />
          </mask>
        ) : null}
      </defs>
      <rect x="0" y="0" width={width} height={height} fill={primaryFill} mask={`url(#${primaryId})`} />
      {!singleLayer && accentMask ? (
        <rect x="0" y="0" width={width} height={height} fill={accentFill} mask={`url(#${accentId})`} />
      ) : null}
    </svg>
  );
}
