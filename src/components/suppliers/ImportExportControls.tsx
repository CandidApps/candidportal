'use client';

import { useEffect, useRef, useState } from 'react';

type ImportExportControlsProps = {
  label: string;
  onExportCsv: () => void | Promise<void>;
  onExportXlsx: () => void | Promise<void>;
  onImport: (file: File) => Promise<{ message: string }>;
  disabled?: boolean;
  variant?: 'buttons' | 'dropdown';
};

export function ImportExportControls({
  label,
  onExportCsv,
  onExportXlsx,
  onImport,
  disabled = false,
  variant = 'buttons',
}: ImportExportControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'import' | 'csv' | 'xlsx' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const run = async (action: 'import' | 'csv' | 'xlsx', fn: () => void | Promise<void>) => {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await fn();
      if (action !== 'import') setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import/export failed');
    } finally {
      setBusy(null);
    }
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".csv,.xlsx,.xls"
      style={{ display: 'none' }}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        void run('import', async () => {
          const result = await onImport(file);
          setMessage(result.message);
          setOpen(false);
        });
      }}
    />
  );

  if (variant === 'dropdown') {
    return (
      <div ref={rootRef} className="import-export-dropdown">
        <button
          type="button"
          className="import-export-dropdown-trigger"
          disabled={disabled || busy !== null}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((o) => !o)}
        >
          {busy === 'import' ? 'Importing…' : busy === 'xlsx' ? 'Exporting…' : busy === 'csv' ? 'Exporting…' : 'Export / Import'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {open && (
          <div className="import-export-dropdown-menu" role="menu">
            <button
              type="button"
              className="import-export-dropdown-item"
              role="menuitem"
              disabled={busy !== null}
              onClick={() => void run('xlsx', onExportXlsx)}
            >
              Export Excel
            </button>
            <button
              type="button"
              className="import-export-dropdown-item"
              role="menuitem"
              disabled={busy !== null}
              onClick={() => void run('csv', onExportCsv)}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="import-export-dropdown-item"
              role="menuitem"
              disabled={busy !== null}
              onClick={() => fileRef.current?.click()}
            >
              Import spreadsheet
            </button>
          </div>
        )}
        {fileInput}
        {(message || error) && (
          <div className={`import-export-dropdown-toast${error ? ' import-export-dropdown-toast--error' : ''}`}>
            {error ?? message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ fontSize: 12, whiteSpace: 'nowrap' }}
          disabled={disabled || busy !== null}
          onClick={() => void run('csv', onExportCsv)}
        >
          {busy === 'csv' ? 'Exporting…' : 'Export CSV'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          style={{ fontSize: 12, whiteSpace: 'nowrap' }}
          disabled={disabled || busy !== null}
          onClick={() => void run('xlsx', onExportXlsx)}
        >
          {busy === 'xlsx' ? 'Exporting…' : 'Export Excel'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          style={{ fontSize: 12, whiteSpace: 'nowrap' }}
          disabled={disabled || busy !== null}
          onClick={() => fileRef.current?.click()}
        >
          {busy === 'import' ? 'Importing…' : 'Import'}
        </button>
        {fileInput}
      </div>
      {(message || error) && (
        <div
          style={{
            fontSize: 11,
            color: error ? 'var(--red)' : 'var(--green)',
            maxWidth: 320,
            textAlign: 'right',
          }}
        >
          {error ?? message}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--gray)', maxWidth: 320, textAlign: 'right' }}>
        {label}
      </div>
    </div>
  );
}
