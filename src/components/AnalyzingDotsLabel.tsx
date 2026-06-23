'use client';

import { useEffect, useState } from 'react';

type AnalyzingDotsLabelProps = {
  prefix?: string;
  /** Milliseconds between dot count changes */
  intervalMs?: number;
  className?: string;
  style?: React.CSSProperties;
};

/** Cycles "Analyzing." → "Analyzing.." → "Analyzing..." */
export function AnalyzingDotsLabel({
  prefix = 'Analyzing',
  intervalMs = 450,
  className,
  style,
}: AnalyzingDotsLabelProps) {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDots((d) => (d % 3) + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return (
    <span className={className} style={style}>
      {prefix}
      {'.'.repeat(dots)}
    </span>
  );
}
