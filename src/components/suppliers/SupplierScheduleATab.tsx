'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SolutionProviderRecord } from '@/lib/solution-providers';
import { isMerchantServicesCategory, providerCategoryLabel } from '@/lib/provider-categories';
import {
  fetchProviderScheduleA,
  parseScheduleAFromFile,
  saveProviderScheduleA,
  scheduleADocumentUrl,
} from '@/lib/schedule-a';
import { newScheduleALine, type ScheduleARateLine } from '@/lib/schedule-a-types';

import { SupplierRateLinesTable } from '@/components/suppliers/SupplierRateLinesTable';

export function SupplierScheduleATab({
  provider,
}: {
  provider: SolutionProviderRecord;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<ScheduleARateLine[]>([]);
  const [filename, setFilename] = useState<string | undefined>();
  const [documentId, setDocumentId] = useState<string | undefined>();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [parseNote, setParseNote] = useState('');

  const reload = useCallback(async () => {
    if (!provider.dbId || provider.fromBmwOnly) {
      setLines([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const record = await fetchProviderScheduleA(provider.id);
      setLines(record?.lines ?? []);
      setFilename(record?.filename);
      setDocumentId(record?.documentId);
      setPendingFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Schedule A');
    } finally {
      setLoading(false);
    }
  }, [provider.dbId, provider.fromBmwOnly, provider.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!isMerchantServicesCategory(provider.providerCategory)) {
    return (
      <p style={{ fontSize: 13, color: 'var(--gray)' }}>
        Set provider type to <strong>Merchant Services</strong> in Edit provider to upload and manage Schedule A rates.
      </p>
    );
  }

  if (provider.fromBmwOnly || !provider.dbId) {
    return (
      <p style={{ fontSize: 13, color: 'var(--gray)' }}>
        Save this vendor to the database before uploading a Schedule A.
      </p>
    );
  }

  const handleFile = async (file: File) => {
    setPendingFile(file);
    setParsing(true);
    setError('');
    setParseNote('');
    try {
      const result = await parseScheduleAFromFile(file);
      setLines(result.lines.length ? result.lines : [newScheduleALine()]);
      setFilename(file.name);
      setParseNote(
        result.summary ??
          (result.lines.length
            ? `Parsed ${result.lines.length} rate line${result.lines.length === 1 ? '' : 's'}. Review and save.`
            : 'No rates found — add lines manually or try a clearer PDF.'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
      setPendingFile(null);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const updateLine = (id: string, patch: Partial<ScheduleARateLine>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await saveProviderScheduleA({
        providerId: provider.id,
        lines,
        file: pendingFile,
      });
      setLines(saved.lines);
      setFilename(saved.filename);
      setDocumentId(saved.documentId);
      setPendingFile(null);
      setParseNote('Schedule A saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const docUrl = scheduleADocumentUrl(undefined, documentId);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Schedule A — buy rates</div>
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
            {providerCategoryLabel(provider.providerCategory)} · Upload a Schedule A PDF to parse buy rates, then edit as needed.
          </div>
          {filename && (
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6 }}>
              On file:{' '}
              {docUrl ? (
                <a href={docUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontWeight: 600 }}>
                  {filename}
                </a>
              ) : (
                filename
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 12 }}
            disabled={parsing}
            onClick={() => fileRef.current?.click()}
          >
            {parsing ? 'Parsing…' : 'Upload Schedule A'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => setLines((prev) => [...prev, newScheduleALine()])}
          >
            + Add line
          </button>
          <button type="button" className="btn-primary" style={{ fontSize: 12 }} disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save rates'}
          </button>
        </div>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {parseNote && <p style={{ color: 'var(--gray)', fontSize: 12, marginBottom: 12 }}>{parseNote}</p>}

      {parsing && (
        <div
          style={{
            padding: '20px 16px',
            marginBottom: 16,
            borderRadius: 8,
            border: '1px solid var(--gray-border)',
            background: 'var(--gray-light)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Parsing Schedule A…</div>
          <div style={{ fontSize: 12, color: 'var(--gray)' }}>
            AI is reading buy rates from your document. This usually takes 15–60 seconds.
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading Schedule A…</p>
      ) : lines.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--gray)' }}>
          No Schedule A rates yet. Upload a PDF or add lines manually.
        </p>
      ) : (
        <SupplierRateLinesTable
          lines={lines}
          onUpdateLine={updateLine}
          onRemoveLine={removeLine}
          emptyMessage="No Schedule A rates yet. Upload a PDF or add lines manually."
        />
      )}
    </div>
  );
}
