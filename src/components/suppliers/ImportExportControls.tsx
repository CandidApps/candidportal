'use client';

import { useRef, useState } from 'react';

type ImportExportControlsProps = {
  label: string;
  onExportCsv: () => void | Promise<void>;
  onExportXlsx: () => void | Promise<void>;
  onImport: (file: File) => Promise<{ message: string }>;
  disabled?: boolean;
};

export function ImportExportControls({
  label,
  onExportCsv,
  onExportXlsx,
  onImport,
  disabled = false,
}: ImportExportControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'import' | 'csv' | 'xlsx' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: 'import' | 'csv' | 'xlsx', fn: () => void | Promise<void>) => {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import/export failed');
    } finally {
      setBusy(null);
    }
  };

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
            });
          }}
        />
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
