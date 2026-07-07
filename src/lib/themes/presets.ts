import type { ThemePreset } from '@/lib/themes/types';

/** Built-in portal themes. Add or load more presets here later. */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'candid',
    name: 'Candid Default',
    description:
      'The standard Candid portal look — Candid red accents, crisp typography, and balanced light and dark modes.',
    swatches: ['#E11D48', '#6366F1', '#E8EEF9', '#0B1220'],
    logoAccent: 'red',
    tokens: {},
  },
  {
    id: 'kubrick',
    name: 'Kubrick Theme',
    description:
      'Inspired by Stanley, the Kubrick theme is vibrant but beautiful like "that" movie.',
    swatches: ['#FF6B35', '#FFD4B8', '#F5F0EB', '#1A2238'],
    fonts: {
      sans: "'Space Grotesk', system-ui, sans-serif",
      display: "'Space Grotesk', system-ui, sans-serif",
    },
    tokens: {
      light: {
        '--red': '#FF6B35',
        '--red-dark': '#E85A24',
        '--red-light': '#FF8C5A',
        '--accent-cool': '#FF6B35',
        '--accent-cyan': '#2EC4B6',
        '--page-bg-solid': '#F5F0EB',
        '--page-bg': '#F5F0EB',
        '--page-gradient':
          'linear-gradient(165deg, #FFF8F3 0%, #F5F0EB 42%, #EDE4DC 100%)',
        '--ambient-glow':
          'radial-gradient(ellipse 70% 55% at 8% -5%, rgba(255, 107, 53, 0.16), transparent 55%), radial-gradient(ellipse 55% 45% at 92% 2%, rgba(26, 34, 56, 0.08), transparent 50%)',
        '--card-bg': 'linear-gradient(165deg, #FFFFFF 0%, #FFF8F3 48%, #F5F0EB 100%)',
        '--sidebar-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #FFF8F3 55%, #F5F0EB 100%)',
        '--sidebar-active':
          'linear-gradient(90deg, rgba(255, 107, 53, 0.14), rgba(26, 34, 56, 0.06))',
        '--sidebar-hover': 'rgba(255, 107, 53, 0.08)',
        '--gray-dark': '#1A2238',
        '--login-bg': 'linear-gradient(145deg, #1A2238 0%, #2A3348 45%, #FF6B35 140%)',
      },
      dark: {
        '--red': '#FF8C5A',
        '--red-dark': '#FF6B35',
        '--red-light': '#FFB088',
        '--accent-cool': '#FF8C5A',
        '--page-bg-solid': '#141824',
        '--page-bg': '#141824',
        '--page-gradient':
          'linear-gradient(165deg, #0E1118 0%, #141824 40%, #1A2238 100%)',
        '--card-bg': 'linear-gradient(165deg, #1E2433 0%, #1A2238 50%, #141824 100%)',
        '--sidebar-gradient': 'linear-gradient(180deg, #141824 0%, #0E1118 100%)',
        '--sidebar-active':
          'linear-gradient(90deg, rgba(255, 107, 53, 0.22), rgba(255, 140, 90, 0.1))',
        '--sidebar-hover': 'rgba(255, 107, 53, 0.12)',
      },
    },
  },
  {
    id: 'kubrick-dark',
    name: 'Kubrick Dark Theme',
    description:
      'A cinematic dark palette with bold orange highlights — best paired with dark mode.',
    swatches: ['#FF6B35', '#1A2238', '#0E1118', '#FFD4B8'],
    fonts: {
      sans: "'Space Grotesk', system-ui, sans-serif",
      display: "'Space Grotesk', system-ui, sans-serif",
    },
    tokens: {
      light: {
        '--red': '#FF6B35',
        '--accent-cool': '#1A2238',
        '--page-bg-solid': '#EDE8E3',
        '--gray-dark': '#1A2238',
      },
      dark: {
        '--red': '#FF6B35',
        '--red-dark': '#E85A24',
        '--red-light': '#FF9A6B',
        '--accent-cool': '#FF6B35',
        '--accent-cyan': '#4CC9F0',
        '--page-bg-solid': '#080A10',
        '--page-bg': '#080A10',
        '--page-gradient':
          'linear-gradient(165deg, #050608 0%, #0E1118 35%, #1A2238 100%)',
        '--ambient-glow':
          'radial-gradient(ellipse 65% 50% at 5% 0%, rgba(255, 107, 53, 0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 95% 5%, rgba(76, 201, 240, 0.1), transparent 50%)',
        '--surface': 'linear-gradient(165deg, #141824 0%, #0E1118 100%)',
        '--card-bg': 'linear-gradient(165deg, #1A2238 0%, #141824 50%, #0E1118 100%)',
        '--sidebar-gradient': 'linear-gradient(180deg, #0A0C12 0%, #050608 100%)',
        '--sidebar-active':
          'linear-gradient(90deg, rgba(255, 107, 53, 0.28), rgba(255, 107, 53, 0.08))',
        '--sidebar-hover': 'rgba(255, 107, 53, 0.14)',
        '--gray-dark': '#F5F0EB',
        '--gray': '#A8B0C2',
        '--login-bg': 'linear-gradient(145deg, #050608 0%, #1A2238 55%, #FF6B35 160%)',
      },
    },
  },
  {
    id: 'capella',
    name: 'Capella Theme',
    description:
      'An elegant purple-and-gold palette with refined contrast — polished and professional.',
    swatches: ['#7C3AED', '#F59E0B', '#F5F3FF', '#1E1B4B'],
    fonts: {
      sans: "'Space Grotesk', system-ui, sans-serif",
      display: "'Space Grotesk', system-ui, sans-serif",
    },
    tokens: {
      light: {
        '--red': '#7C3AED',
        '--red-dark': '#6D28D9',
        '--red-light': '#A78BFA',
        '--accent-cool': '#7C3AED',
        '--accent-cyan': '#F59E0B',
        '--green': '#059669',
        '--page-bg-solid': '#F5F3FF',
        '--page-bg': '#F5F3FF',
        '--page-gradient':
          'linear-gradient(165deg, #FAF5FF 0%, #F5F3FF 45%, #EDE9FE 100%)',
        '--ambient-glow':
          'radial-gradient(ellipse 70% 55% at 8% -5%, rgba(124, 58, 237, 0.14), transparent 55%), radial-gradient(ellipse 55% 45% at 92% 2%, rgba(245, 158, 11, 0.1), transparent 50%)',
        '--card-bg': 'linear-gradient(165deg, #FFFFFF 0%, #FAF5FF 48%, #F5F3FF 100%)',
        '--sidebar-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #FAF5FF 55%, #F5F3FF 100%)',
        '--sidebar-active':
          'linear-gradient(90deg, rgba(124, 58, 237, 0.14), rgba(245, 158, 11, 0.08))',
        '--sidebar-hover': 'rgba(124, 58, 237, 0.08)',
        '--gray-dark': '#1E1B4B',
        '--login-bg': 'linear-gradient(145deg, #1E1B4B 0%, #4C1D95 45%, #7C3AED 120%)',
      },
      dark: {
        '--red': '#A78BFA',
        '--red-dark': '#8B5CF6',
        '--red-light': '#C4B5FD',
        '--accent-cool': '#A78BFA',
        '--accent-cyan': '#FBBF24',
        '--page-bg-solid': '#0F0A1A',
        '--page-bg': '#0F0A1A',
        '--page-gradient':
          'linear-gradient(165deg, #0A0612 0%, #0F0A1A 40%, #1E1B4B 100%)',
        '--card-bg': 'linear-gradient(165deg, #1A1430 0%, #151020 50%, #0F0A1A 100%)',
        '--sidebar-gradient': 'linear-gradient(180deg, #120E1E 0%, #0A0612 100%)',
        '--sidebar-active':
          'linear-gradient(90deg, rgba(167, 139, 250, 0.24), rgba(251, 191, 36, 0.1))',
        '--sidebar-hover': 'rgba(167, 139, 250, 0.12)',
      },
    },
  },
  {
    id: 'dialpad',
    name: 'Dialpad Theme',
    description:
      "Dialpad's brand palette — vivid violet, hot-pink accents, and clean warm-white surfaces.",
    swatches: ['#7D52FF', '#FA008F', '#F5F3FB', '#1D0156'],
    logoAccent: 'accent-cyan',
    tokens: {
      light: {
        '--red': '#7D52FF',
        '--red-dark': '#6A3DF5',
        '--red-light': '#A488FF',
        '--accent-cool': '#7D52FF',
        '--accent-cyan': '#FA008F',
        '--green': '#0EA47A',
        '--blue': '#5B6BFF',
        '--page-bg-solid': '#F5F3FB',
        '--page-bg': '#F5F3FB',
        '--page-gradient':
          'linear-gradient(165deg, #FBFAFE 0%, #F5F3FB 45%, #EFEAF9 100%)',
        '--ambient-glow':
          'radial-gradient(ellipse 70% 55% at 8% -5%, rgba(125, 82, 255, 0.16), transparent 55%), radial-gradient(ellipse 55% 45% at 92% 2%, rgba(250, 0, 143, 0.1), transparent 50%), radial-gradient(ellipse 40% 35% at 50% 100%, rgba(125, 82, 255, 0.06), transparent 50%)',
        '--card-bg': 'linear-gradient(165deg, #FFFFFF 0%, #FBFAFE 48%, #F5F3FB 100%)',
        '--card-header-bg':
          'linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(245, 243, 251, 0.65) 100%)',
        '--sidebar-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #FBFAFE 55%, #F2EEFB 100%)',
        '--sidebar-active':
          'linear-gradient(90deg, rgba(125, 82, 255, 0.14), rgba(250, 0, 143, 0.07))',
        '--sidebar-hover': 'rgba(125, 82, 255, 0.08)',
        '--gray-dark': '#1A1235',
        '--login-bg': 'linear-gradient(145deg, #1D0156 0%, #3B1B8F 45%, #7D52FF 120%)',
      },
      dark: {
        '--red': '#9B7BFF',
        '--red-dark': '#7D52FF',
        '--red-light': '#B9A3FF',
        '--accent-cool': '#9B7BFF',
        '--accent-cyan': '#FF3DAE',
        '--green': '#2DD4BF',
        '--blue': '#7C8BFF',
        '--page-bg-solid': '#0D0820',
        '--page-bg': '#0D0820',
        '--page-gradient':
          'linear-gradient(165deg, #080418 0%, #0D0820 40%, #1D0156 100%)',
        '--ambient-glow':
          'radial-gradient(ellipse 65% 50% at 5% 0%, rgba(155, 123, 255, 0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 95% 5%, rgba(255, 61, 174, 0.12), transparent 50%), radial-gradient(ellipse 35% 30% at 50% 100%, rgba(125, 82, 255, 0.1), transparent 50%)',
        '--surface': 'linear-gradient(165deg, #181233 0%, #120D28 100%)',
        '--surface-muted': 'rgba(18, 13, 40, 0.85)',
        '--card-bg': 'linear-gradient(165deg, #1B1438 0%, #150F2E 50%, #100A22 100%)',
        '--card-header-bg':
          'linear-gradient(180deg, rgba(27, 20, 56, 0.95) 0%, rgba(21, 15, 46, 0.75) 100%)',
        '--sidebar-gradient': 'linear-gradient(180deg, #120C28 0%, #0A0618 100%)',
        '--sidebar-active':
          'linear-gradient(90deg, rgba(155, 123, 255, 0.26), rgba(255, 61, 174, 0.1))',
        '--sidebar-hover': 'rgba(155, 123, 255, 0.12)',
        '--gray-dark': '#EDE9FB',
        '--login-bg': 'linear-gradient(145deg, #080418 0%, #1D0156 55%, #7D52FF 160%)',
      },
    },
  },
];

export const DEFAULT_THEME_PRESET_ID = 'candid';

/** Runtime-registered custom themes (per account). */
const customPresets = new Map<string, ThemePreset>();

export function registerCustomThemePresets(presets: ThemePreset[]) {
  for (const preset of presets) {
    customPresets.set(preset.id, preset);
  }
}

export function unregisterCustomThemePreset(id: string) {
  customPresets.delete(id);
}

export function getCustomThemePresets(): ThemePreset[] {
  return [...customPresets.values()];
}

export function getThemePreset(id: string): ThemePreset {
  if (customPresets.has(id)) return customPresets.get(id)!;
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

/** Register additional presets at runtime (e.g. loaded from API later). */
let extraPresets: ThemePreset[] = [];

export function registerThemePresets(presets: ThemePreset[]) {
  extraPresets = [...extraPresets, ...presets];
}

export function listThemePresets(): ThemePreset[] {
  const ids = new Set<string>();
  const out: ThemePreset[] = [];
  for (const preset of [...THEME_PRESETS, ...extraPresets, ...customPresets.values()]) {
    if (ids.has(preset.id)) continue;
    ids.add(preset.id);
    out.push(preset);
  }
  return out;
}
