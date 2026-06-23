export type ColorScheme = 'light' | 'dark';

/** CSS custom properties a theme preset may override. */
export type ThemeTokenOverrides = Partial<Record<string, string>>;

export type ThemePresetFonts = {
  sans?: string;
  display?: string;
  mono?: string;
};

export type ThemePreset = {
  id: string;
  name: string;
  description: string;
  /** Four preview swatches shown on the picker card. */
  swatches: [string, string, string, string];
  fonts?: ThemePresetFonts;
  /** Token overrides per color scheme (light / dark). */
  tokens: {
    light?: ThemeTokenOverrides;
    dark?: ThemeTokenOverrides;
  };
};
