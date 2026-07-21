'use client';

import { useState } from 'react';
import type { InternetPricingLine, InternetPricingOption } from '@/lib/internet/internet-quote-types';

export function InternetPricingOptionEditorModal({
  option,
  onClose,
  onSave,
}: {
  option: InternetPricingOption;
  onClose: () => void;
  onSave: (next: InternetPricingOption) => void;
}) {
  const [lines, setLines] = useState<InternetPricingLine[]>(option.lines);

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 1100, width: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Edit ${option.supplierName} pricing`}
      >
        <div className="modal-header">
          <div className="modal-title">{option.supplierName} — pricing review</div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div
          className="modal-body"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            overflow: 'auto',
            flex: 1,
          }}
        >
          <div>
            <p style={{ fontSize: 12, color: 'var(--gray)', marginTop: 0 }}>
              Edit parsed lines if anything looks wrong. Changes apply to the customer proposal.
            </p>
            {lines.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--gray)', padding: 12, background: 'var(--gray-light)', borderRadius: 8 }}>
                No pricing lines were parsed from this PDF. Check the source text on the right, or add lines
                manually below.
              </p>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lines.map((line, idx) => (
                <div
                  key={line.id}
                  style={{
                    border: '1px solid var(--gray-border)',
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <input
                    className="form-input"
                    value={line.label}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx] = { ...line, label: e.target.value };
                      setLines(next);
                    }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                    <input
                      className="form-input"
                      placeholder="Monthly $"
                      value={line.monthlyPrice ?? ''}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = {
                          ...line,
                          monthlyPrice: e.target.value ? Number(e.target.value) : null,
                        };
                        setLines(next);
                      }}
                    />
                    <input
                      className="form-input"
                      placeholder="Down Mbps"
                      value={line.downloadMbps ?? ''}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = {
                          ...line,
                          downloadMbps: e.target.value ? Number(e.target.value) : null,
                        };
                        setLines(next);
                      }}
                    />
                    <input
                      className="form-input"
                      placeholder="Up Mbps"
                      value={line.uploadMbps ?? ''}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = {
                          ...line,
                          uploadMbps: e.target.value ? Number(e.target.value) : null,
                        };
                        setLines(next);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: 12 }}
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  {
                    id: `ipl-${Date.now()}`,
                    section: 'Services',
                    label: '',
                    downloadMbps: null,
                    uploadMbps: null,
                    monthlyPrice: null,
                    termMonths: 36,
                  },
                ])
              }
            >
              Add pricing line
            </button>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Source PDF</div>
            {option.pdfFilename ? (
              <p style={{ fontSize: 13 }}>{option.pdfFilename}</p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>No PDF on file.</p>
            )}
            {option.parsedRawText ? (
              <pre
                style={{
                  fontSize: 10,
                  background: 'var(--gray-light)',
                  padding: 12,
                  borderRadius: 8,
                  maxHeight: 420,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {option.parsedRawText.slice(0, 12000)}
              </pre>
            ) : null}
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onSave({ ...option, lines })}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
