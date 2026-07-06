import {
  buildCustomThemePreset,
  customThemePresetId,
  validateCustomThemeColors,
  type CustomThemeColors,
} from '@/lib/themes/build-custom-preset';
import type { SavedCustomTheme } from '@/components/ThemeProvider';

const STORAGE_KEY = 'candid-local-custom-themes';

function readRaw(): SavedCustomTheme[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedCustomTheme[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(themes: SavedCustomTheme[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  } catch {
    /* ignore */
  }
}

export function listLocalCustomThemes(): SavedCustomTheme[] {
  return readRaw().filter((t) => validateCustomThemeColors(t.colors));
}

export function saveLocalCustomTheme(name: string, colors: CustomThemeColors): SavedCustomTheme {
  const id = crypto.randomUUID();
  const theme: SavedCustomTheme = {
    id,
    presetId: customThemePresetId(id),
    name,
    colors,
  };
  writeRaw([theme, ...readRaw().filter((t) => t.id !== id)]);
  buildCustomThemePreset({ id, name, colors });
  return theme;
}

export function deleteLocalCustomTheme(id: string): boolean {
  const next = readRaw().filter((t) => t.id !== id);
  if (next.length === readRaw().length) return false;
  writeRaw(next);
  return true;
}
