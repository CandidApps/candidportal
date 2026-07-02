/** Color math for theme generation with accessible contrast. */

export type Rgb = { r: number; g: number; b: number };

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(HEX_RE);
  if (!match) return null;
  return `#${match[1]!.toUpperCase()}`;
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const n = normalized.slice(1);
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function mixHex(a: string, b: string, t: number): string {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return a;
  const mix = (x: number, y: number) => x + (y - x) * t;
  return rgbToHex({
    r: mix(rgbA.r, rgbB.r),
    g: mix(rgbA.g, rgbB.g),
    b: mix(rgbA.b, rgbB.b),
  });
}

export function lighten(hex: string, amount: number): string {
  return mixHex(hex, '#FFFFFF', amount);
}

export function darken(hex: string, amount: number): string {
  return mixHex(hex, '#000000', amount);
}

/** Push foreground toward black or white until contrast vs background meets minRatio. */
export function ensureContrast(
  fgHex: string,
  bgHex: string,
  minRatio = 4.5,
): string {
  let fg = normalizeHex(fgHex) ?? '#0B1220';
  const bg = normalizeHex(bgHex) ?? '#FFFFFF';
  if (contrastRatio(fg, bg) >= minRatio) return fg;

  const towardLight = relativeLuminance(bg) < 0.45;
  for (let step = 0.04; step <= 1; step += 0.04) {
    const candidate = towardLight ? lighten(fg, step) : darken(fg, step);
    if (contrastRatio(candidate, bg) >= minRatio) return candidate;
  }
  return towardLight ? '#F8FAFC' : '#0B1220';
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function isLightBackground(hex: string): boolean {
  return relativeLuminance(hex) > 0.55;
}
