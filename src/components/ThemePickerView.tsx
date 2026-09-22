'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { CustomThemeCreator } from '@/components/CustomThemeCreator';
import { useTheme } from '@/components/ThemeProvider';
import { ensureFontStylesheet, listFontPairs, type FontPair } from '@/lib/themes/fonts';

export type ThemePickerAdminNavEdit = {
  editMode: boolean;
  onEditModeChange: (editing: boolean) => void;
  onRestoreDefaults: () => void;
};

function FontPairPicker({
  fontPairs,
  fontPairId,
  onSelect,
}: {
  fontPairs: FontPair[];
  fontPairId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = fontPairs.find((p) => p.id === fontPairId) ?? fontPairs[0]!;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`theme-picker-font-dropdown${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="theme-picker-font-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="theme-picker-font-trigger-main">
          <span className="theme-picker-font-trigger-name" style={{ fontFamily: current.fonts.display }}>
            {current.name}
          </span>
          <span className="theme-picker-font-trigger-sample" style={{ fontFamily: current.fonts.sans }}>
            {current.sample ?? 'Aa Bb 123'}
          </span>
        </span>
        <span className={`theme-picker-font-chevron${open ? ' is-open' : ''}`} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="theme-picker-font-flyout" id={listId} role="listbox" aria-label="Font pairs">
          {fontPairs.map((pair) => {
            const isApplied = pair.id === fontPairId;
            return (
              <button
                key={pair.id}
                type="button"
                role="option"
                aria-selected={isApplied}
                className={`theme-picker-font-option${isApplied ? ' is-applied' : ''}`}
                onClick={() => {
                  onSelect(pair.id);
                  setOpen(false);
                }}
              >
                <span className="theme-picker-font-card-main">
                  <span className="theme-picker-font-card-title" style={{ fontFamily: pair.fonts.display }}>
                    {pair.name}
                  </span>
                  <span className="theme-picker-font-card-sample" style={{ fontFamily: pair.fonts.sans }}>
                    {pair.sample ?? 'The quick brown fox jumps over the lazy dog.'}
                  </span>
                  <span className="theme-picker-font-card-desc">{pair.description}</span>
                </span>
                {isApplied ? <span className="theme-picker-font-option-check">Applied</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ThemePickerView({
  onBack,
  variant = 'member',
  adminNavEdit,
}: {
  onBack: () => void;
  /** Admin uses "Customize UI"; member keeps theme-focused copy. */
  variant?: 'admin' | 'member';
  adminNavEdit?: ThemePickerAdminNavEdit;
}) {
  const {
    presetId,
    presets,
    setPresetId,
    colorScheme,
    setColorScheme,
    fontPairId,
    setFontPairId,
  } = useTheme();
  const builtInPresets = presets.filter((p) => !p.isCustom);
  const fontPairs = listFontPairs();
  const isAdmin = variant === 'admin';

  useEffect(() => {
    for (const pair of listFontPairs()) ensureFontStylesheet(pair);
  }, []);

  return (
    <div className="theme-picker">
      <div className="theme-picker-header">
        <button type="button" className="theme-picker-back" onClick={onBack} aria-label="Back">
          <AppIcon name="panelCollapse" size={18} />
        </button>
        <h2 className="theme-picker-title">{isAdmin ? 'Customize UI' : 'Pick Your Theme'}</h2>
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
        {isAdmin
          ? 'Theme, fonts, light/dark mode, and sidebar layout for the admin portal. Custom themes sync to your account.'
          : 'Choose a visual style for your portal. Light and dark mode work with any theme — use the toggle above to preview both. Custom themes sync to your account.'}
      </p>

      {isAdmin && adminNavEdit ? (
        <section className="theme-picker-nav-edit">
          <h3 className="theme-picker-section-title">Sidebar menu</h3>
          <p className="theme-picker-nav-edit-hint">
            Show, hide, and reorder admin tabs. Product roadmap stays in the footer icon strip.
          </p>
          <div className="theme-picker-nav-edit-actions">
            {adminNavEdit.editMode ? (
              <button
                type="button"
                className="theme-picker-apply"
                onClick={adminNavEdit.onRestoreDefaults}
              >
                Restore defaults
              </button>
            ) : null}
            <button
              type="button"
              className={`theme-picker-apply${adminNavEdit.editMode ? ' is-applied' : ''}`}
              onClick={() => adminNavEdit.onEditModeChange(!adminNavEdit.editMode)}
            >
              <AppIcon name={adminNavEdit.editMode ? 'check' : 'edit'} size={12} />
              {adminNavEdit.editMode ? 'Done editing sidebar' : 'Edit sidebar tabs'}
            </button>
          </div>
          {adminNavEdit.editMode ? (
            <p className="theme-picker-nav-edit-live">
              Checkboxes and drag handles are active in the left sidebar — edit there, then click Done.
            </p>
          ) : null}
        </section>
      ) : null}

      <h3 className="theme-picker-section-title">Fonts</h3>
      <p className="theme-picker-font-intro">
        Pick a type pair for the portal. Display fonts apply to titles; body uses the matching sans.
      </p>
      <FontPairPicker fontPairs={fontPairs} fontPairId={fontPairId} onSelect={setFontPairId} />

      <CustomThemeCreator />

      <h3 className="theme-picker-section-title theme-picker-section-title--spaced">Built-in themes</h3>

      <div className="theme-picker-list">
        {builtInPresets.map((preset) => {
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
