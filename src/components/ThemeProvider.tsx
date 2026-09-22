'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { applyColorScheme, applyThemePreset } from '@/lib/themes/apply';
import {
  buildCustomThemePreset,
  customThemePresetId,
  type CustomThemeColors,
} from '@/lib/themes/build-custom-preset';
import {
  applyFontPair,
  DEFAULT_FONT_PAIR_ID,
  getFontPair,
} from '@/lib/themes/fonts';
import {
  DEFAULT_THEME_PRESET_ID,
  getThemePreset,
  listThemePresets,
  registerCustomThemePresets,
  registerThemePresets,
  unregisterCustomThemePreset,
} from '@/lib/themes/presets';
import type { ColorScheme, ThemePreset } from '@/lib/themes/types';
import {
  deleteLocalCustomTheme,
  listLocalCustomThemes,
  saveLocalCustomTheme,
} from '@/lib/themes/local-custom-themes';

export type { ColorScheme } from '@/lib/themes/types';

const COLOR_SCHEME_KEY = 'candid-color-scheme';
const PRESET_KEY = 'candid-theme-preset';
const FONT_PAIR_KEY = 'candid-font-pair';
const LEGACY_THEME_KEY = 'candid-theme';

export type SavedCustomTheme = {
  id: string;
  presetId: string;
  name: string;
  colors: CustomThemeColors;
};

type ThemeContextValue = {
  colorScheme: ColorScheme;
  theme: ColorScheme;
  isDark: boolean;
  presetId: string;
  preset: ThemePreset;
  presets: ThemePreset[];
  fontPairId: string;
  customThemes: SavedCustomTheme[];
  mounted: boolean;
  setColorScheme: (scheme: ColorScheme) => void;
  setTheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
  toggleTheme: () => void;
  setPresetId: (id: string) => void;
  setFontPairId: (id: string) => void;
  registerPresets: (presets: ThemePreset[]) => void;
  saveCustomTheme: (name: string, colors: CustomThemeColors) => Promise<{ presetId: string } | null>;
  deleteCustomTheme: (id: string) => Promise<boolean>;
  refreshCustomThemes: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyAll(colorScheme: ColorScheme, presetId: string, fontPairId: string) {
  applyColorScheme(colorScheme);
  applyThemePreset(presetId, colorScheme);
  applyFontPair(fontPairId);
}

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

function readStoredFontPairId(): string {
  if (typeof window === 'undefined') return DEFAULT_FONT_PAIR_ID;
  return getFontPair(localStorage.getItem(FONT_PAIR_KEY)).id;
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

function persistFontPairId(id: string) {
  try {
    localStorage.setItem(FONT_PAIR_KEY, id);
  } catch {
    /* ignore */
  }
}

async function syncThemeSettings(presetId: string, colorScheme: ColorScheme) {
  try {
    await fetch('/api/portal/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId, colorScheme }),
    });
  } catch {
    /* offline or logged out */
  }
}

function registerSavedCustomThemes(themes: SavedCustomTheme[]) {
  registerCustomThemePresets(
    themes.map((t) => buildCustomThemePreset({ id: t.id, name: t.name, colors: t.colors })),
  );
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
  const [fontPairId, setFontPairIdState] = useState<string>(DEFAULT_FONT_PAIR_ID);
  const [presetList, setPresetList] = useState<ThemePreset[]>(() => listThemePresets());
  const [customThemes, setCustomThemes] = useState<SavedCustomTheme[]>([]);
  const [mounted, setMounted] = useState(false);
  const syncedFromServer = useRef(false);

  const refreshPresetList = useCallback(() => {
    setPresetList(listThemePresets());
  }, []);

  const loadFromServer = useCallback(async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch('/api/portal/theme');
      if (!res.ok) return;
      const data = (await res.json()) as {
        presetId?: string | null;
        colorScheme?: ColorScheme | null;
        customThemes?: SavedCustomTheme[];
      };

      const savedCustom = data.customThemes ?? [];
      const localCustom = listLocalCustomThemes();
      const mergedCustom = [
        ...savedCustom,
        ...localCustom.filter((l) => !savedCustom.some((s) => s.id === l.id)),
      ];
      setCustomThemes(mergedCustom);
      registerSavedCustomThemes(mergedCustom);
      refreshPresetList();

      const scheme =
        data.colorScheme === 'dark' || data.colorScheme === 'light'
          ? data.colorScheme
          : readStoredColorScheme();
      const preset = data.presetId?.trim() || readStoredPresetId();
      const fontPair = readStoredFontPairId();

      setColorSchemeState(scheme);
      setPresetIdState(getThemePreset(preset).id);
      setFontPairIdState(fontPair);
      persistColorScheme(scheme);
      persistPresetId(getThemePreset(preset).id);
      persistFontPairId(fontPair);
      applyAll(scheme, getThemePreset(preset).id, fontPair);
      syncedFromServer.current = true;
    } catch {
      /* ignore */
    }
  }, [refreshPresetList]);

  useEffect(() => {
    const scheme = readStoredColorScheme();
    const preset = readStoredPresetId();
    const fontPair = readStoredFontPairId();
    setColorSchemeState(scheme);
    setPresetIdState(preset);
    setFontPairIdState(fontPair);
    applyAll(scheme, preset, fontPair);
    const localCustom = listLocalCustomThemes();
    if (localCustom.length) {
      registerSavedCustomThemes(localCustom);
      refreshPresetList();
      setCustomThemes(localCustom);
    }
    setMounted(true);
    void loadFromServer();
  }, [loadFromServer, refreshPresetList]);

  const setColorScheme = useCallback(
    (next: ColorScheme) => {
      setColorSchemeState(next);
      persistColorScheme(next);
      applyAll(next, presetId, fontPairId);
      if (syncedFromServer.current) void syncThemeSettings(presetId, next);
    },
    [presetId, fontPairId],
  );

  const setPresetId = useCallback(
    (nextId: string) => {
      const id = getThemePreset(nextId).id;
      setPresetIdState(id);
      persistPresetId(id);
      applyAll(colorScheme, id, fontPairId);
      if (syncedFromServer.current) void syncThemeSettings(id, colorScheme);
    },
    [colorScheme, fontPairId],
  );

  const setFontPairId = useCallback(
    (nextId: string) => {
      const id = getFontPair(nextId).id;
      setFontPairIdState(id);
      persistFontPairId(id);
      applyAll(colorScheme, presetId, id);
    },
    [colorScheme, presetId],
  );

  const toggleColorScheme = useCallback(() => {
    setColorSchemeState((prev) => {
      const next: ColorScheme = prev === 'light' ? 'dark' : 'light';
      persistColorScheme(next);
      applyAll(next, presetId, fontPairId);
      if (syncedFromServer.current) void syncThemeSettings(presetId, next);
      return next;
    });
  }, [presetId, fontPairId]);

  const registerPresets = useCallback(
    (presets: ThemePreset[]) => {
      registerThemePresets(presets);
      refreshPresetList();
    },
    [refreshPresetList],
  );

  const saveCustomTheme = useCallback(
    async (name: string, colors: CustomThemeColors): Promise<{ presetId: string } | null> => {
      try {
        const res = await fetch('/api/portal/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, colors }),
        });

        if (res.ok) {
          const data = (await res.json()) as { theme?: SavedCustomTheme; presetId?: string };
          if (!data.theme) return null;

          const theme = data.theme;
          registerCustomThemePresets([
            buildCustomThemePreset({ id: theme.id, name: theme.name, colors: theme.colors }),
          ]);
          setCustomThemes((prev) => [theme, ...prev.filter((t) => t.id !== theme.id)]);
          refreshPresetList();

          const nextPresetId = data.presetId ?? customThemePresetId(theme.id);
          setPresetIdState(nextPresetId);
          persistPresetId(nextPresetId);
          applyAll(colorScheme, nextPresetId, fontPairId);
          syncedFromServer.current = true;
          void syncThemeSettings(nextPresetId, colorScheme);
          return { presetId: nextPresetId };
        }

        if (res.status === 401) return null;
      } catch {
        /* fall through to local save */
      }

      const theme = saveLocalCustomTheme(name, colors);
      registerCustomThemePresets([
        buildCustomThemePreset({ id: theme.id, name: theme.name, colors: theme.colors }),
      ]);
      setCustomThemes((prev) => [theme, ...prev.filter((t) => t.id !== theme.id)]);
      refreshPresetList();
      setPresetIdState(theme.presetId);
      persistPresetId(theme.presetId);
      applyAll(colorScheme, theme.presetId, fontPairId);
      return { presetId: theme.presetId };
    },
    [colorScheme, fontPairId, refreshPresetList],
  );

  const deleteCustomTheme = useCallback(
    async (id: string): Promise<boolean> => {
      const preset = customThemePresetId(id);
      let fallbackPresetId = DEFAULT_THEME_PRESET_ID;

      try {
        const res = await fetch(`/api/portal/theme/custom/${id}`, { method: 'DELETE' });
        if (res.ok) {
          const data = (await res.json()) as { fallbackPresetId?: string };
          fallbackPresetId = data.fallbackPresetId ?? DEFAULT_THEME_PRESET_ID;
        }
      } catch {
        /* local-only theme */
      }

      deleteLocalCustomTheme(id);
      unregisterCustomThemePreset(preset);
      setCustomThemes((prev) => prev.filter((t) => t.id !== id));
      refreshPresetList();

      if (presetId === preset) {
        setPresetIdState(fallbackPresetId);
        persistPresetId(fallbackPresetId);
        applyAll(colorScheme, fallbackPresetId, fontPairId);
        void syncThemeSettings(fallbackPresetId, colorScheme);
      }
      return true;
    },
    [colorScheme, fontPairId, presetId, refreshPresetList],
  );

  const refreshCustomThemes = useCallback(async () => {
    await loadFromServer();
  }, [loadFromServer]);

  const preset = useMemo(() => getThemePreset(presetId), [presetId]);

  const value = useMemo(
    () => ({
      colorScheme,
      theme: colorScheme,
      isDark: colorScheme === 'dark',
      presetId,
      preset,
      presets: presetList,
      fontPairId,
      customThemes,
      mounted,
      setColorScheme,
      setTheme: setColorScheme,
      toggleColorScheme,
      toggleTheme: toggleColorScheme,
      setPresetId,
      setFontPairId,
      registerPresets,
      saveCustomTheme,
      deleteCustomTheme,
      refreshCustomThemes,
    }),
    [
      colorScheme,
      presetId,
      preset,
      presetList,
      fontPairId,
      customThemes,
      mounted,
      setColorScheme,
      toggleColorScheme,
      setPresetId,
      setFontPairId,
      registerPresets,
      saveCustomTheme,
      deleteCustomTheme,
      refreshCustomThemes,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
