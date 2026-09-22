import type { ThemePresetFonts } from '@/lib/themes/types';

export type FontPair = {
  id: string;
  name: string;
  description: string;
  /** CSS stacks for --font-sans / --font-display / --font-mono */
  fonts: Required<Pick<ThemePresetFonts, 'sans' | 'display'>> & { mono?: string };
  /** Google Fonts CSS2 family query (without leading ?). Empty = already in globals.css */
  googleQuery?: string;
  /** Sample label shown on the picker card */
  sample?: string;
};

export const DEFAULT_FONT_PAIR_ID = 'space-grotesk';

export const FONT_PAIRS: FontPair[] = [
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    description: 'Current Candid default — geometric, clear, product-first.',
    fonts: {
      sans: "'Space Grotesk', system-ui, sans-serif",
      display: "'Space Grotesk', system-ui, sans-serif",
    },
    sample: 'Aa Bb 123',
  },
  {
    id: 'outfit',
    name: 'Outfit',
    description: 'Rounded geometric sans — friendly and modern for dashboards.',
    fonts: {
      sans: "'Outfit', system-ui, sans-serif",
      display: "'Outfit', system-ui, sans-serif",
    },
    googleQuery: 'family=Outfit:wght@400;500;600;700',
    sample: 'Aa Bb 123',
  },
  {
    id: 'manrope',
    name: 'Manrope',
    description: 'Semi-condensed geometric — dense UI without feeling cramped.',
    fonts: {
      sans: "'Manrope', system-ui, sans-serif",
      display: "'Manrope', system-ui, sans-serif",
    },
    googleQuery: 'family=Manrope:wght@400;500;600;700',
    sample: 'Aa Bb 123',
  },
  {
    id: 'syne-dm',
    name: 'Syne + DM Sans',
    description: 'Bold display headlines with a clean body sans.',
    fonts: {
      sans: "'DM Sans', system-ui, sans-serif",
      display: "'Syne', system-ui, sans-serif",
    },
    googleQuery: 'family=Syne:wght@500;600;700&family=DM+Sans:wght@400;500;600;700',
    sample: 'Aa Bb 123',
  },
  {
    id: 'fraunces-source',
    name: 'Fraunces + Source Sans',
    description: 'Editorial soft serif display with a readable humanist body.',
    fonts: {
      sans: "'Source Sans 3', system-ui, sans-serif",
      display: "'Fraunces', Georgia, serif",
    },
    googleQuery: 'family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Source+Sans+3:wght@400;500;600;700',
    sample: 'Aa Bb 123',
  },
  {
    id: 'literata-figtree',
    name: 'Literata + Figtree',
    description: 'Bookish display with a calm contemporary body.',
    fonts: {
      sans: "'Figtree', system-ui, sans-serif",
      display: "'Literata', Georgia, serif",
    },
    googleQuery: 'family=Literata:opsz,wght@7..72,500;7..72,600;7..72,700&family=Figtree:wght@400;500;600;700',
    sample: 'Aa Bb 123',
  },
  {
    id: 'ibm-plex',
    name: 'IBM Plex Sans',
    description: 'Technical and precise — strong for data-heavy admin screens.',
    fonts: {
      sans: "'IBM Plex Sans', system-ui, sans-serif",
      display: "'IBM Plex Sans', system-ui, sans-serif",
      mono: "'IBM Plex Mono', ui-monospace, monospace",
    },
    googleQuery: 'family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600',
    sample: 'Aa Bb 123',
  },
  {
    id: 'sora',
    name: 'Sora',
    description: 'Slightly quirky geometric — distinctive without shouting.',
    fonts: {
      sans: "'Sora', system-ui, sans-serif",
      display: "'Sora', system-ui, sans-serif",
    },
    googleQuery: 'family=Sora:wght@400;500;600;700',
    sample: 'Aa Bb 123',
  },
];

export function getFontPair(id: string | null | undefined): FontPair {
  return FONT_PAIRS.find((p) => p.id === id) ?? FONT_PAIRS[0]!;
}

export function listFontPairs(): FontPair[] {
  return FONT_PAIRS;
}

export function ensureFontStylesheet(pair: FontPair): void {
  if (typeof document === 'undefined' || !pair.googleQuery) return;
  const elId = `candid-font-pair-${pair.id}`;
  if (document.getElementById(elId)) return;
  const link = document.createElement('link');
  link.id = elId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${pair.googleQuery}&display=swap`;
  document.head.appendChild(link);
}

/** Apply font CSS variables (call after theme preset so user choice wins). */
export function applyFontPair(
  fontPairId: string,
  root: HTMLElement = document.documentElement,
): void {
  const pair = getFontPair(fontPairId);
  ensureFontStylesheet(pair);
  root.setAttribute('data-font-pair', pair.id);
  root.style.setProperty('--font-sans', pair.fonts.sans);
  root.style.setProperty('--font-display', pair.fonts.display);
  if (pair.fonts.mono) {
    root.style.setProperty('--font-mono', pair.fonts.mono);
  } else {
    root.style.removeProperty('--font-mono');
  }
}
