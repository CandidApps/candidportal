import type { ColorScheme, ThemePreset, ThemeTokenOverrides } from '@/lib/themes/types';
import {
  contrastRatio,
  darken,
  ensureContrast,
  hexToRgba,
  lighten,
  mixHex,
  normalizeHex,
} from '@/lib/themes/colors';

/** [primary, accent] — background and text are derived from light/dark mode. */
export type CustomThemeColors = [string, string];

export type CustomThemeInput = {
  id: string;
  name: string;
  colors: CustomThemeColors;
};

export const CUSTOM_THEME_PREFIX = 'custom-';

/** Standard portal shells — tinted by primary/accent, not user-picked. */
const LIGHT_PAGE_BG = '#E8EEF9';
const LIGHT_TEXT = '#0B1220';
const DARK_PAGE_BG = '#0B1220';
const DARK_TEXT = '#E8EEF9';

export function customThemePresetId(uuid: string): string {
  return `${CUSTOM_THEME_PREFIX}${uuid}`;
}

export function parseCustomThemePresetId(presetId: string): string | null {
  if (!presetId.startsWith(CUSTOM_THEME_PREFIX)) return null;
  return presetId.slice(CUSTOM_THEME_PREFIX.length) || null;
}

export function validateCustomThemeColors(colors: string[]): CustomThemeColors | null {
  if (colors.length !== 2 && colors.length !== 4) return null;
  const primary = normalizeHex(colors[0] ?? '');
  const accent = normalizeHex(colors[1] ?? '');
  if (!primary || !accent) return null;
  return [primary, accent];
}

function primaryVariants(primary: string): { dark: string; light: string } {
  return {
    dark: darken(primary, 0.12),
    light: lighten(primary, 0.18),
  };
}

function buildLightTokens(primary: string, accent: string): ThemeTokenOverrides {
  const pageBg = mixHex(LIGHT_PAGE_BG, primary, 0.05);
  const pageBgSoft = lighten(pageBg, 0.04);
  const textMain = ensureContrast(LIGHT_TEXT, pageBg);
  const textMuted = ensureContrast(mixHex(textMain, pageBg, 0.45), pageBg, 3.2);
  const { dark: redDark, light: redLight } = primaryVariants(primary);
  const cardBg = lighten(pageBg, 0.06);
  const border = mixHex(textMain, pageBg, 0.82);

  return {
    '--red': primary,
    '--red-dark': redDark,
    '--red-light': redLight,
    '--accent-cool': accent,
    '--accent-cyan': mixHex(accent, primary, 0.35),
    '--page-bg-solid': pageBg,
    '--page-bg': pageBg,
    '--page-gradient': `linear-gradient(165deg, ${lighten(pageBg, 0.08)} 0%, ${pageBg} 42%, ${darken(pageBg, 0.04)} 100%)`,
    '--ambient-glow': `radial-gradient(ellipse 70% 55% at 8% -5%, ${hexToRgba(primary, 0.14)}, transparent 55%), radial-gradient(ellipse 55% 45% at 92% 2%, ${hexToRgba(accent, 0.1)}, transparent 50%)`,
    '--surface': cardBg,
    '--card-bg': `linear-gradient(165deg, ${lighten(cardBg, 0.04)} 0%, ${cardBg} 48%, ${pageBgSoft} 100%)`,
    '--card-header-bg': `linear-gradient(180deg, ${hexToRgba(lighten(cardBg, 0.04), 0.95)} 0%, ${hexToRgba(cardBg, 0.72)} 100%)`,
    '--sidebar-gradient': `linear-gradient(180deg, ${lighten(pageBg, 0.06)} 0%, ${pageBgSoft} 55%, ${pageBg} 100%)`,
    '--sidebar-active': `linear-gradient(90deg, ${hexToRgba(primary, 0.14)}, ${hexToRgba(accent, 0.08)})`,
    '--sidebar-hover': hexToRgba(primary, 0.07),
    '--sidebar-text': textMuted,
    '--sidebar-text-muted': mixHex(textMuted, pageBg, 0.35),
    '--sidebar-text-active': textMain,
    '--topbar-bg': `linear-gradient(180deg, ${hexToRgba(cardBg, 0.96)} 0%, ${hexToRgba(pageBgSoft, 0.9)} 100%)`,
    '--gray-dark': textMain,
    '--gray-mid': mixHex(textMain, pageBg, 0.25),
    '--gray': textMuted,
    '--gray-light': mixHex(pageBg, primary, 0.06),
    '--gray-border': border,
    '--gray-border-strong': mixHex(textMain, pageBg, 0.72),
    '--white': cardBg,
    '--login-bg': `linear-gradient(145deg, ${darken(textMain, 0.05)} 0%, ${mixHex(textMain, primary, 0.55)} 45%, ${primary} 120%)`,
    '--brand-logo-accent': primary,
    '--hero-border': hexToRgba(primary, 0.22),
    '--border-card': hexToRgba(textMain, 0.09),
  };
}

function buildDarkTokens(primary: string, accent: string): ThemeTokenOverrides {
  const pageBg = mixHex(DARK_PAGE_BG, primary, 0.1);
  const pageBgDeep = darken(pageBg, 0.08);
  const textMain = ensureContrast(DARK_TEXT, pageBg);
  const textMuted = ensureContrast(mixHex(textMain, pageBg, 0.42), pageBg, 3.2);
  const primaryOnDark = lighten(primary, 0.22);
  const accentOnDark = lighten(accent, 0.18);
  const { dark: redDark, light: redLight } = primaryVariants(primaryOnDark);
  const surface = lighten(pageBg, 0.06);
  const border = mixHex(textMain, pageBg, 0.78);

  return {
    '--red': primaryOnDark,
    '--red-dark': redDark,
    '--red-light': redLight,
    '--accent-cool': accentOnDark,
    '--accent-cyan': mixHex(accentOnDark, primaryOnDark, 0.4),
    '--page-bg-solid': pageBg,
    '--page-bg': pageBg,
    '--page-gradient': `linear-gradient(165deg, ${pageBgDeep} 0%, ${pageBg} 40%, ${lighten(pageBg, 0.04)} 100%)`,
    '--ambient-glow': `radial-gradient(ellipse 65% 50% at 5% 0%, ${hexToRgba(primaryOnDark, 0.22)}, transparent 55%), radial-gradient(ellipse 50% 40% at 95% 5%, ${hexToRgba(accentOnDark, 0.12)}, transparent 50%)`,
    '--surface': `linear-gradient(165deg, ${surface} 0%, ${pageBg} 100%)`,
    '--card-bg': `linear-gradient(165deg, ${lighten(surface, 0.04)} 0%, ${surface} 50%, ${pageBgDeep} 100%)`,
    '--card-header-bg': `linear-gradient(180deg, ${hexToRgba(lighten(surface, 0.04), 0.95)} 0%, ${hexToRgba(pageBg, 0.78)} 100%)`,
    '--sidebar-gradient': `linear-gradient(180deg, ${pageBgDeep} 0%, ${darken(pageBg, 0.06)} 100%)`,
    '--sidebar-active': `linear-gradient(90deg, ${hexToRgba(primaryOnDark, 0.24)}, ${hexToRgba(accentOnDark, 0.1)})`,
    '--sidebar-hover': hexToRgba(primaryOnDark, 0.1),
    '--sidebar-text': textMuted,
    '--sidebar-text-muted': mixHex(textMuted, pageBg, 0.35),
    '--sidebar-text-active': textMain,
    '--topbar-bg': `linear-gradient(180deg, ${hexToRgba(surface, 0.96)} 0%, ${hexToRgba(pageBgDeep, 0.92)} 100%)`,
    '--gray-dark': textMain,
    '--gray-mid': mixHex(textMain, pageBg, 0.22),
    '--gray': textMuted,
    '--gray-light': surface,
    '--gray-border': border,
    '--gray-border-strong': mixHex(textMain, pageBg, 0.65),
    '--white': surface,
    '--login-bg': `linear-gradient(145deg, ${darken(pageBg, 0.12)} 0%, ${mixHex(pageBg, primary, 0.45)} 55%, ${primary} 160%)`,
    '--brand-logo-accent': primaryOnDark,
    '--hero-border': hexToRgba(primaryOnDark, 0.28),
    '--border-card': hexToRgba(textMain, 0.14),
  };
}

export function buildCustomThemePreset(input: CustomThemeInput): ThemePreset {
  const colors = validateCustomThemeColors(input.colors);
  if (!colors) {
    throw new Error('Invalid custom theme colors');
  }
  const [primary, accent] = colors;
  const light = buildLightTokens(primary, accent);
  const dark = buildDarkTokens(primary, accent);

  if (contrastRatio('#FFFFFF', primary) < 3) {
    light['--red'] = darken(primary, 0.08);
    light['--brand-logo-accent'] = light['--red'];
  }
  if (contrastRatio('#FFFFFF', dark['--red'] ?? primary) < 3) {
    dark['--red'] = lighten(dark['--red'] ?? primary, 0.08);
    dark['--brand-logo-accent'] = dark['--red'];
  }

  return {
    id: customThemePresetId(input.id),
    name: input.name.trim() || 'Custom theme',
    description: 'Your custom portal colors — saved to your account.',
    swatches: colors,
    isCustom: true,
    logoAccent: 'primary',
    tokens: { light, dark },
  };
}

export function previewCustomThemeTokens(
  colors: CustomThemeColors,
  scheme: ColorScheme,
): Record<string, string> {
  const [primary, accent] = colors;
  const tokens =
    scheme === 'dark'
      ? buildDarkTokens(primary, accent)
      : buildLightTokens(primary, accent);
  return Object.fromEntries(
    Object.entries(tokens).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}
