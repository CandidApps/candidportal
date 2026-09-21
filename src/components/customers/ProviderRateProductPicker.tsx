'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  PROVIDER_RATE_PARTNERS,
  candidNetForPaySource,
  type ProviderRatePartnerKey,
} from '@/lib/provider-rate-nets';

type ProductRow = {
  id: number;
  product_name: string;
  category: string | null;
  gross_rate_pct: number | null;
  intelisys_supported: boolean | null;
  sandler_supported: boolean | null;
  telarus_supported: boolean | null;
  appdirect_supported: boolean | null;
  appdirect_saas_supported: boolean | null;
  candid_net_intelisys: number | null;
  candid_net_sandler: number | null;
  candid_net_telarus: number | null;
  candid_net_appdirect_telco: number | null;
  candid_net_appdirect_saas: number | null;
  net_overrides?: Record<string, number> | null;
};

type PartnerShare = { key: ProviderRatePartnerKey; sharePct: number; defaultSharePct: number };

function shareMap(shares: PartnerShare[]): Record<ProviderRatePartnerKey, number> {
  const out = {} as Record<ProviderRatePartnerKey, number>;
  for (const def of PROVIDER_RATE_PARTNERS) {
    const hit = shares.find((s) => s.key === def.key);
    out[def.key] = hit?.sharePct ?? def.defaultSharePct;
  }
  return out;
}

/**
 * Searchable Provider Rates product picker for a supplier.
 * Selecting a row returns the product name + Candid net % for the deal pay source
 * (or max supported net when pay source is blank / non-portfolio).
 */
export function ProviderRateProductPicker({
  supplierName,
  paySource,
  value,
  onSelect,
  inputStyle,
  placeholder = 'Search commission product…',
}: {
  supplierName: string;
  paySource?: string;
  value: string;
  onSelect: (next: { productName: string; candidNetPct: number | null; productId: number }) => void;
  inputStyle?: CSSProperties;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [shares, setShares] = useState<PartnerShare[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sharesMap = useMemo(() => shareMap(shares), [shares]);

  useEffect(() => {
    setQ(value);
  }, [value]);

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
      });
      if (q.trim() && q.trim().toLowerCase() !== supplier.toLowerCase()) {
        params.set('q', q.trim());
      }
      const res = await fetch(`/api/admin/earnings-dry-run?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load products');
      setRows(data.products ?? []);
      if (data.partnerShares) setShares(data.partnerShares);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [supplierName, q]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(t);
  }, [open, load]);

  const pick = (row: ProductRow) => {
    const net = candidNetForPaySource({
      product: row,
      paySource,
      shareByKey: sharesMap,
    });
    onSelect({ productName: row.product_name, candidNetPct: net, productId: row.id });
    setQ(row.product_name);
    setOpen(false);
  };

  const disabled = !supplierName.trim();

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={q}
        disabled={disabled}
        placeholder={disabled ? 'Choose supplier / provider first' : placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          onSelect({ productName: e.target.value, candidNetPct: null, productId: 0 });
        }}
        onFocus={() => setOpen(true)}
        style={{
          ...inputStyle,
          background: disabled ? 'var(--gray-light, #f3f4f6)' : inputStyle?.background,
        }}
      />
      {open && !disabled && (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            maxHeight: 240,
            overflow: 'auto',
            background: 'var(--page-bg-solid, #fff)',
            border: '1px solid var(--gray-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          }}
        >
          {loading ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--gray)' }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--gray)' }}>
              No Provider Rates products for this supplier.
            </div>
          ) : (
            rows.map((row) => {
              const net = candidNetForPaySource({
                product: row,
                paySource,
                shareByKey: sharesMap,
              });
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => pick(row)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    borderBottom: '1px solid var(--gray-border)',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{row.product_name}</div>
                  <div style={{ color: 'var(--gray)', marginTop: 2 }}>
                    {[row.category, row.gross_rate_pct != null ? `Gross ${row.gross_rate_pct}%` : null]
                      .filter(Boolean)
                      .join(' · ')}
                    {net != null ? ` · Candid net ${net}%` : ''}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
