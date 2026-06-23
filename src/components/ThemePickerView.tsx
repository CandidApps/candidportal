'use client';

import { AppIcon } from '@/components/AppIcon';
import { useTheme } from '@/components/ThemeProvider';

export function ThemePickerView({ onBack }: { onBack: () => void }) {
  const { presetId, presets, setPresetId, colorScheme, setColorScheme } = useTheme();

  return (
    <div className="theme-picker">
      <div className="theme-picker-header">
        <button type="button" className="theme-picker-back" onClick={onBack} aria-label="Back">
          <AppIcon name="panelCollapse" size={18} />
        </button>
        <h2 className="theme-picker-title">Pick Your Theme</h2>
        <button
          type="button"
          className="theme-picker-scheme-toggle"
          onClick={() => setColorScheme(colorScheme === 'light' ? 'dark' : 'light')}
          title={colorScheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          <AppIcon name={colorScheme === 'light' ? 'moon' : 'sun'} size={14} />
          {colorScheme === 'light' ? 'Dark' : 'Light'}
        </button>
      </div>

      <p className="theme-picker-intro">
        Choose a visual style for your portal. Light and dark mode work with any theme — use the
        toggle above to preview both.
      </p>

      <div className="theme-picker-list">
        {presets.map((preset) => {
          const isApplied = preset.id === presetId;
          return (
            <article key={preset.id} className={`theme-picker-card${isApplied ? ' is-applied' : ''}`}>
              <h3 className="theme-picker-card-title">{preset.name}</h3>
              <p className="theme-picker-card-desc">{preset.description}</p>
              <div className="theme-picker-card-footer">
                <div className="theme-picker-swatches" aria-hidden>
                  {preset.swatches.map((color) => (
                    <span
                      key={color}
                      className="theme-picker-swatch"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className={`theme-picker-apply${isApplied ? ' is-applied' : ''}`}
                  disabled={isApplied}
                  onClick={() => setPresetId(preset.id)}
                >
                  {isApplied ? 'Applied' : 'Apply'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
