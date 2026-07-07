import type { ColorScheme, ThemePreset, ThemeTokenOverrides } from '@/lib/themes/types';
import { getThemePreset } from '@/lib/themes/presets';

/** All CSS variables presets are allowed to override (cleared when switching presets). */
export const THEME_OVERRIDE_KEYS = [
  '--red',
  '--red-dark',
  '--red-light',
  '--accent-cool',
  '--accent-cyan',
  '--green',
  '--green-light',
  '--amber',
  '--amber-light',
  '--blue',
  '--blue-light',
  '--page-bg-solid',
  '--page-bg',
  '--page-gradient',
  '--ambient-glow',
  '--surface',
  '--surface-muted',
  '--card-bg',
  '--card-header-bg',
  '--sidebar-gradient',
  '--sidebar-bg',
  '--sidebar-border',
  '--sidebar-text',
  '--sidebar-text-muted',
  '--sidebar-text-active',
  '--sidebar-hover',
  '--sidebar-active',
  '--sidebar-section',
  '--topbar-bg',
  '--gray-dark',
  '--gray-mid',
  '--gray',
  '--gray-light',
  '--gray-border',
  '--gray-border-strong',
  '--white',
  '--login-bg',
  '--panel-dark-from',
  '--panel-dark-to',
  '--panel-dark',
  '--panel-dark-mid',
  '--hero-border',
  '--border-card',
  '--shadow-xs',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  '--font-sans',
  '--font-display',
  '--font-mono',
  '--brand-logo-accent',
] as const;

export function clearPresetTokens(root: HTMLElement = document.documentElement) {
  for (const key of THEME_OVERRIDE_KEYS) {
    root.style.removeProperty(key);
  }
}

export function applyThemePreset(
  presetId: string,
  colorScheme: ColorScheme,
  root: HTMLElement = document.documentElement,
) {
  clearPresetTokens(root);

  const preset = getThemePreset(presetId);
  root.setAttribute('data-theme-preset', preset.id);

  const tokenMap = colorScheme === 'dark' ? preset.tokens.dark : preset.tokens.light;
  if (tokenMap) {
    for (const [key, value] of Object.entries(tokenMap)) {
      if (value != null) root.style.setProperty(key, value);
    }
  }

  if (preset.fonts?.sans) root.style.setProperty('--font-sans', preset.fonts.sans);
  if (preset.fonts?.display) root.style.setProperty('--font-display', preset.fonts.display);
  if (preset.fonts?.mono) root.style.setProperty('--font-mono', preset.fonts.mono);

  const accent = resolveLogoAccent(preset, tokenMap, root);
  if (accent) root.style.setProperty('--brand-logo-accent', accent);
}

function resolveLogoAccent(
  preset: ThemePreset,
  tokenMap: ThemeTokenOverrides | undefined,
  root: HTMLElement,
): string {
  const read = (key: string) =>
    tokenMap?.[key] ?? getComputedStyle(root).getPropertyValue(key).trim();

  switch (preset.logoAccent) {
    case 'red':
      return read('--red');
    case 'accent-cyan':
      return read('--accent-cyan');
    case 'primary':
      return tokenMap?.['--brand-logo-accent'] ?? read('--red');
    case 'accent-cool':
    default:
      return read('--accent-cool');
  }
}

export function applyColorScheme(
  colorScheme: ColorScheme,
  root: HTMLElement = document.documentElement,
) {
  root.setAttribute('data-theme', colorScheme);
  root.setAttribute('data-color-scheme', colorScheme);
  root.style.colorScheme = colorScheme;
}

export function previewThemePreset(
  preset: ThemePreset,
  colorScheme: ColorScheme,
  root: HTMLElement = document.documentElement,
) {
  applyThemePreset(preset.id, colorScheme, root);
}

/** Apply a token map directly (e.g. live custom-theme preview). */
export function applyTokenOverrides(
  tokenMap: Record<string, string>,
  colorScheme: ColorScheme,
  root: HTMLElement = document.documentElement,
) {
  clearPresetTokens(root);
  root.setAttribute('data-theme-preset', 'custom-preview');
  applyColorScheme(colorScheme, root);
  for (const [key, value] of Object.entries(tokenMap)) {
    if (value) root.style.setProperty(key, value);
  }
}
