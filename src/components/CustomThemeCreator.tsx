'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { useTheme } from '@/components/ThemeProvider';
import { applyThemePreset, applyTokenOverrides } from '@/lib/themes/apply';
import {
  previewCustomThemeTokens,
  validateCustomThemeColors,
  type CustomThemeColors,
} from '@/lib/themes/build-custom-preset';

const COLOR_LABELS = [
  { label: 'Primary', hint: 'Buttons, links, logo accent' },
  { label: 'Accent', hint: 'Highlights and secondary actions' },
] as const;

const DEFAULT_DRAFT: CustomThemeColors = ['#E11D48', '#6366F1'];

export function CustomThemeCreator({ onApplied }: { onApplied?: () => void }) {
  const {
    colorScheme,
    presetId,
    customThemes,
    presets,
    saveCustomTheme,
    deleteCustomTheme,
    setPresetId,
  } = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('My theme');
  const [colors, setColors] = useState<CustomThemeColors>(DEFAULT_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previewing = useRef(false);
  const savedPresetRef = useRef(presetId);

  const validated = useMemo(() => validateCustomThemeColors(colors), [colors]);

  const previewDraft = useCallback(() => {
    if (!validated || !open) return;
    previewing.current = true;
    applyTokenOverrides(previewCustomThemeTokens(validated, colorScheme), colorScheme);
  }, [validated, colorScheme, open]);

  useEffect(() => {
    if (open) {
      savedPresetRef.current = presetId;
      previewDraft();
    } else if (previewing.current) {
      previewing.current = false;
      applyThemePreset(savedPresetRef.current, colorScheme);
    }
  }, [open, previewDraft, colorScheme, presetId]);

  useEffect(() => {
    if (open) previewDraft();
  }, [colors, colorScheme, open, previewDraft]);

  const setColor = (index: number, value: string) => {
    setColors((prev) => {
      const next = [...prev] as CustomThemeColors;
      next[index] = value;
      return next;
    });
  };

  const handleSave = async () => {
    setError('');
    if (!validated) {
      setError('Enter two valid hex colors (e.g. #E11D48).');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name your theme before saving.');
      return;
    }
    setBusy(true);
    try {
      const result = await saveCustomTheme(trimmed, validated);
      if (!result) {
        setError('Could not save theme. Sign in and ensure migration 0056 is applied.');
        return;
      }
      previewing.current = false;
      setOpen(false);
      onApplied?.();
    } catch {
      setError('Could not save theme. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const builtInPresets = presets.filter((p) => !p.isCustom);

  return (
    <section className="theme-picker-custom">
      <div className="theme-picker-custom-head">
        <h3 className="theme-picker-section-title">Custom themes</h3>
        <p className="theme-picker-section-desc">
          Choose a primary and accent color. Backgrounds and text follow your light or dark mode
          setting and update automatically when you switch.
        </p>
      </div>

      {!open ? (
        <button type="button" className="theme-picker-create-btn" onClick={() => setOpen(true)}>
          <AppIcon name="add" size={14} /> Create custom theme
        </button>
      ) : (
        <div className="theme-custom-form">
          <label className="theme-custom-field">
            <span className="theme-custom-label">Theme name</span>
            <input
              type="text"
              value={name}
              maxLength={48}
              onChange={(e) => setName(e.target.value)}
              placeholder="My theme"
            />
          </label>

          <div className="theme-custom-colors">
            {colors.map((color, index) => (
              <label key={index} className="theme-custom-color-row">
                <span className="theme-custom-color-meta">
                  <span className="theme-custom-label">{COLOR_LABELS[index]?.label ?? `Color ${index + 1}`}</span>
                  <span className="theme-custom-hint">{COLOR_LABELS[index]?.hint ?? ''}</span>
                </span>
                <div className="theme-custom-color-inputs">
                  <input
                    type="color"
                    value={validated?.[index] ?? DEFAULT_DRAFT[index]}
                    onChange={(e) => setColor(index, e.target.value)}
                    aria-label={`${COLOR_LABELS[index]?.label ?? 'Color'} color`}
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(index, e.target.value)}
                    placeholder="#RRGGBB"
                    spellCheck={false}
                  />
                </div>
              </label>
            ))}
          </div>

          {validated ? (
            <div className="theme-custom-preview">
              <div className="theme-custom-preview-swatches" aria-hidden>
                {validated.map((c) => (
                  <span key={c} className="theme-picker-swatch" style={{ backgroundColor: c }} />
                ))}
              </div>
              <p className="theme-custom-contrast">
                Previewing in {colorScheme === 'dark' ? 'dark' : 'light'} mode — toggle light/dark
                above to see both.
              </p>
            </div>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}

          <div className="theme-custom-actions">
            <button
              type="button"
              className="btn-secondary theme-custom-cancel"
              onClick={() => {
                setOpen(false);
                applyThemePreset(savedPresetRef.current, colorScheme);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary theme-custom-save"
              disabled={busy || !validated}
              onClick={() => void handleSave()}
            >
              {busy ? 'Saving…' : 'Save & apply'}
            </button>
          </div>
        </div>
      )}

      {customThemes.length > 0 ? (
        <div className="theme-custom-list">
          {customThemes.map((theme) => {
            const isApplied = presetId === theme.presetId;
            const swatches = validateCustomThemeColors(theme.colors) ?? theme.colors.slice(0, 2);
            return (
              <article
                key={theme.id}
                className={`theme-picker-card theme-picker-card--custom${isApplied ? ' is-applied' : ''}`}
              >
                <h4 className="theme-picker-card-title">{theme.name}</h4>
                <p className="theme-picker-card-desc">Your custom theme</p>
                <div className="theme-picker-card-footer">
                  <div className="theme-picker-swatches" aria-hidden>
                    {swatches.map((color) => (
                      <span
                        key={color}
                        className="theme-picker-swatch"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="theme-custom-row-actions">
                    <button
                      type="button"
                      className={`theme-picker-apply${isApplied ? ' is-applied' : ''}`}
                      disabled={isApplied}
                      onClick={() => setPresetId(theme.presetId)}
                    >
                      {isApplied ? 'Applied' : 'Apply'}
                    </button>
                    <button
                      type="button"
                      className="theme-custom-delete"
                      title="Delete theme"
                      aria-label={`Delete ${theme.name}`}
                      onClick={() => void deleteCustomTheme(theme.id)}
                    >
                      <AppIcon name="close" size={13} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {builtInPresets.length > 0 && customThemes.length === 0 && !open ? (
        <p className="theme-custom-empty">No custom themes yet — create one above.</p>
      ) : null}
    </section>
  );
}
