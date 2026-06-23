'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { applyColorScheme, applyThemePreset } from '@/lib/themes/apply';
import {
  DEFAULT_THEME_PRESET_ID,
  getThemePreset,
  listThemePresets,
  registerThemePresets,
} from '@/lib/themes/presets';
import type { ColorScheme, ThemePreset } from '@/lib/themes/types';

export type { ColorScheme } from '@/lib/themes/types';

const COLOR_SCHEME_KEY = 'candid-color-scheme';
const PRESET_KEY = 'candid-theme-preset';
/** @deprecated Use COLOR_SCHEME_KEY — kept for migration */
const LEGACY_THEME_KEY = 'candid-theme';

type ThemeContextValue = {
  /** Light or dark color scheme */
  colorScheme: ColorScheme;
  /** @deprecated Alias for colorScheme */
  theme: ColorScheme;
  isDark: boolean;
  presetId: string;
  preset: ThemePreset;
  presets: ThemePreset[];
  mounted: boolean;
  setColorScheme: (scheme: ColorScheme) => void;
  /** @deprecated Alias for setColorScheme */
  setTheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
  /** @deprecated Alias for toggleColorScheme */
  toggleTheme: () => void;
  setPresetId: (id: string) => void;
  registerPresets: (presets: ThemePreset[]) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredColorScheme(): ColorScheme {
  if (typeof window === 'undefined') return 'light';
  const stored =
    (localStorage.getItem(COLOR_SCHEME_KEY) as ColorScheme | null) ??
    (localStorage.getItem(LEGACY_THEME_KEY) as ColorScheme | null);
  return stored === 'dark' || stored === 'light' ? stored : 'light';
}

function readStoredPresetId(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME_PRESET_ID;
  return localStorage.getItem(PRESET_KEY) ?? DEFAULT_THEME_PRESET_ID;
}

function persistColorScheme(scheme: ColorScheme) {
  try {
    localStorage.setItem(COLOR_SCHEME_KEY, scheme);
    localStorage.setItem(LEGACY_THEME_KEY, scheme);
  } catch {
    /* ignore */
  }
}

function persistPresetId(id: string) {
  try {
    localStorage.setItem(PRESET_KEY, id);
  } catch {
    /* ignore */
  }
}

function applyAll(colorScheme: ColorScheme, presetId: string) {
  applyColorScheme(colorScheme);
  applyThemePreset(presetId, colorScheme);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>('light');
  const [presetId, setPresetIdState] = useState<string>(DEFAULT_THEME_PRESET_ID);
  const [presetList, setPresetList] = useState<ThemePreset[]>(() => listThemePresets());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const scheme = readStoredColorScheme();
    const preset = readStoredPresetId();
    setColorSchemeState(scheme);
    setPresetIdState(preset);
    applyAll(scheme, preset);
    setMounted(true);
  }, []);

  const setColorScheme = useCallback(
    (next: ColorScheme) => {
      setColorSchemeState(next);
      persistColorScheme(next);
      applyAll(next, presetId);
    },
    [presetId],
  );

  const setPresetId = useCallback(
    (nextId: string) => {
      const id = getThemePreset(nextId).id;
      setPresetIdState(id);
      persistPresetId(id);
      applyAll(colorScheme, id);
    },
    [colorScheme],
  );

  const toggleColorScheme = useCallback(() => {
    setColorSchemeState((prev) => {
      const next: ColorScheme = prev === 'light' ? 'dark' : 'light';
      persistColorScheme(next);
      applyAll(next, presetId);
      return next;
    });
  }, [presetId]);

  const registerPresets = useCallback((presets: ThemePreset[]) => {
    registerThemePresets(presets);
    setPresetList(listThemePresets());
  }, []);

  const preset = useMemo(() => getThemePreset(presetId), [presetId]);

  const value = useMemo(
    () => ({
      colorScheme,
      theme: colorScheme,
      isDark: colorScheme === 'dark',
      presetId,
      preset,
      presets: presetList,
      mounted,
      setColorScheme,
      setTheme: setColorScheme,
      toggleColorScheme,
      toggleTheme: toggleColorScheme,
      setPresetId,
      registerPresets,
    }),
    [
      colorScheme,
      presetId,
      preset,
      presetList,
      mounted,
      setColorScheme,
      toggleColorScheme,
      setPresetId,
      registerPresets,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
