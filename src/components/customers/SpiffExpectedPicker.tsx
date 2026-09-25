'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

type SpiffRow = {
  id: number;
  product_name: string;
  gross_rate_pct: number | null;
  note: string | null;
};

/**
 * Combobox for SPIFF expected: free-text amount/expression plus search of
 * supplier Provider Rates products whose names mention SPIFF.
 */
export function SpiffExpectedPicker({
  supplierName,
  value,
  onChange,
  inputStyle,
  onBlurEvaluate,
}: {
  supplierName: string;
  value: string;
  onChange: (next: string) => void;
  inputStyle?: CSSProperties;
  onBlurEvaluate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SpiffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const load = useCallback(async () => {
    const supplier = supplierName.trim();
    if (!supplier) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '40',
        offset: '0',
        providerName: supplier,
        q: 'spiff',
      });
      const res = await fetch(`/api/admin/earnings-dry-run?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      const products = (data.products ?? []) as SpiffRow[];
      setRows(
        products.filter(
          (p) =>
            /spiff/i.test(p.product_name) ||
            /spiff/i.test(p.note ?? '') ||
            /promo|one[- ]?time/i.test(p.product_name),
        ),
      );
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [supplierName]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void load(), 150);
    return () => window.clearTimeout(t);
  }, [open, load]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => onBlurEvaluate?.()}
        placeholder="e.g. 100x5 or search SPIFF…"
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1px solid var(--gray-border, #E2E2E2)',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          ...inputStyle,
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            maxHeight: 220,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid var(--gray-border, #E2E2E2)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          }}
        >
          {!supplierName.trim() ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--gray)' }}>
              Select a provider first to search SPIFFs.
            </div>
          ) : loading ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--gray)' }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--gray)' }}>
              No SPIFF products found — type an amount (e.g. 500 or 100x5).
            </div>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(row.product_name);
                  setOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  borderBottom: '1px solid var(--gray-border)',
                  background: 'transparent',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600 }}>{row.product_name}</div>
                {row.gross_rate_pct != null ? (
                  <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                    Gross {row.gross_rate_pct}%
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
