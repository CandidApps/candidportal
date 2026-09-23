'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PROVIDER_RATE_PARTNERS,
  formatPctPoints,
  type ProviderRatePartnerKey,
} from '@/lib/provider-rate-nets';
import type { PartnerSupplierRecord } from '@/lib/services/bank-deposits';

export type PartnerSplitRow = {
  key: string;
  label: string;
  short: string;
  sharePct: number;
  defaultSharePct: number;
  globalSharePct?: number;
  supplierOverride?: boolean;
  isPortfolio?: boolean;
};

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function slugifyPartnerKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function partnerOptionKey(p: PartnerSupplierRecord): string {
  const fromSupplierKey = (p.supplier_key ?? '').trim().toLowerCase();
  if (fromSupplierKey) {
    // Map commission table keys onto portfolio keys when possible
    if (fromSupplierKey.includes('sandler')) return 'sandler';
    if (fromSupplierKey.includes('intelisys')) return 'intelisys';
    if (fromSupplierKey.includes('telarus')) return 'telarus';
    if (fromSupplierKey.includes('appdirect')) return 'appdirect_telco';
    return slugifyPartnerKey(fromSupplierKey);
  }
  return slugifyPartnerKey(p.display_name || p.name);
}

/**
 * Supplier-level Candid share of gross by commission partner.
 * Read-only until pencil; used on Overview + Add/Edit supplier.
 */
export function SupplierPartnerSplitsPanel({
  providerSlug,
  providerName,
  commissionPartners = [],
  compact = false,
  onSaved,
}: {
  providerSlug: string;
  providerName?: string;
  /** Live commission partners registry — used for “Add partner”. */
  commissionPartners?: PartnerSupplierRecord[];
  compact?: boolean;
  onSaved?: (shares: PartnerSplitRow[]) => void;
}) {
  const [shares, setShares] = useState<PartnerSplitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  const [addPartnerKey, setAddPartnerKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!providerSlug.trim()) {
      setShares([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        mode: 'summary',
        provider: providerSlug.trim().toLowerCase(),
      });
      if (providerName) params.set('providerName', providerName);
      const res = await fetch(`/api/admin/earnings-dry-run?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load partner splits');
      const next = (data.partnerShares ?? []) as PartnerSplitRow[];
      setShares(next);
      const extras = next.filter((s) => s.isPortfolio === false).map((s) => s.key);
      setExtraKeys(extras);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, [providerSlug, providerName]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetDraft = useCallback((list: PartnerSplitRow[]) => {
    const init: Record<string, string> = {};
    for (const s of list) {
      init[s.key] = s.supplierOverride ? String(s.sharePct) : '';
    }
    setDraft(init);
  }, []);

  useEffect(() => {
    if (!editing) resetDraft(shares);
  }, [shares, editing, resetDraft]);

  const displayRows = useMemo(() => {
    const byKey = new Map(shares.map((s) => [s.key, s]));
    const rows: PartnerSplitRow[] = PROVIDER_RATE_PARTNERS.map((def) => {
      const hit = byKey.get(def.key);
      return (
        hit ?? {
          key: def.key,
          label: def.label,
          short: def.short,
          sharePct: def.defaultSharePct,
          defaultSharePct: def.defaultSharePct,
          globalSharePct: def.defaultSharePct,
          supplierOverride: false,
          isPortfolio: true,
        }
      );
    });
    for (const key of extraKeys) {
      if (rows.some((r) => r.key === key)) continue;
      const hit = byKey.get(key);
      if (hit) rows.push(hit);
      else {
        rows.push({
          key,
          label: key,
          short: key.slice(0, 3),
          sharePct: 85,
          defaultSharePct: 85,
          globalSharePct: 85,
          supplierOverride: true,
          isPortfolio: false,
        });
      }
    }
    for (const s of shares) {
      if (s.isPortfolio === false && !rows.some((r) => r.key === s.key)) rows.push(s);
    }
    return rows;
  }, [shares, extraKeys]);

  const addablePartners = useMemo(() => {
    const used = new Set(displayRows.map((r) => r.key));
    const out: Array<{ key: string; label: string; rate: number | null }> = [];
    const seen = new Set<string>();
    for (const p of commissionPartners) {
      const key = partnerOptionKey(p);
      if (!key || used.has(key) || seen.has(key)) continue;
      // Skip if already covered by a portfolio matcher
      if (PROVIDER_RATE_PARTNERS.some((d) => d.key === key) && used.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        label: (p.display_name || p.name).trim(),
        rate: p.commission_rate,
      });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [commissionPartners, displayRows]);

  const cancelEdit = () => {
    resetDraft(shares);
    setExtraKeys(shares.filter((s) => s.isPortfolio === false).map((s) => s.key));
    setAddPartnerKey('');
    setEditing(false);
    setNotice(null);
  };

  const addSelectedPartner = () => {
    const key = addPartnerKey.trim();
    if (!key) return;
    const opt = addablePartners.find((p) => p.key === key);
    setExtraKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setDraft((d) => ({
      ...d,
      [key]: d[key] || (opt?.rate != null ? String(opt.rate) : ''),
    }));
    setAddPartnerKey('');
  };

  const removeExtra = (key: string) => {
    setExtraKeys((prev) => prev.filter((k) => k !== key));
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const overrides: Record<string, number> = {};
      for (const row of displayRows) {
        const raw = (draft[row.key] ?? '').trim();
        if (!raw) {
          // Extra partners must stay in overrides or they drop off the list
          if (row.isPortfolio === false) {
            overrides[row.key] = row.globalSharePct ?? row.defaultSharePct ?? row.sharePct;
          }
          continue;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new Error(`Invalid share for ${row.label}`);
        overrides[row.key] = n;
      }
      const res = await fetch('/api/admin/earnings-dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_partner_shares',
          provider_slug: providerSlug.trim().toLowerCase(),
          provider_name: providerName,
          partner_share_overrides: overrides,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      const next = (data.partnerShares ?? []) as PartnerSplitRow[];
      setShares(next);
      setExtraKeys(next.filter((s) => s.isPortfolio === false).map((s) => s.key));
      setEditing(false);
      setNotice('Partner splits saved.');
      onSaved?.(next);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  if (!providerSlug.trim()) {
    return (
      <p style={{ fontSize: 12, color: 'var(--gray)', margin: '0 0 16px' }}>
        Save the supplier first to set partner splits.
      </p>
    );
  }

  return (
    <div
      style={{
        marginBottom: compact ? 12 : 24,
        padding: compact ? 12 : 14,
        border: '1px solid var(--gray-border)',
        borderRadius: 8,
        background: 'var(--page-bg-solid, #fff)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)' }}>
          Partner splits for this supplier
        </div>
        {!editing && !loading ? (
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setEditing(true);
            }}
            title="Edit partner splits"
            aria-label="Edit partner splits"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 6,
              border: '1px solid var(--gray-border)',
              background: 'var(--white, #fff)',
              color: 'var(--gray-dark)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <PencilIcon />
          </button>
        ) : null}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--gray)', lineHeight: 1.45 }}>
        {editing
          ? 'Leave blank to use the commission partner rate. Set a % to override for all products. Add other partners if they sell this vendor.'
          : 'Candid share of gross used to compute product nets. Pencil to edit or add partners.'}
      </p>

      {error ? <p style={{ color: 'var(--red)', fontSize: 12, margin: '0 0 8px' }}>{error}</p> : null}
      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--gray)', margin: 0 }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: editing ? 12 : 0 }}>
          {displayRows.map((s) => {
            const baseline = s.globalSharePct ?? s.defaultSharePct;
            const isExtra = s.isPortfolio === false;
            return (
              <div
                key={s.key}
                style={{
                  flex: '0 1 148px',
                  width: 148,
                  minWidth: 132,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 12,
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ fontWeight: 600, lineHeight: 1.3, minHeight: 32 }}>
                  {s.label}
                  {!isExtra ? (
                    <span style={{ fontWeight: 400, color: 'var(--gray)' }}>
                      {' '}
                      ({formatPctPoints(baseline, 0)})
                    </span>
                  ) : null}
                </span>
                {editing ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      style={{
                        padding: '8px 10px',
                        width: '100%',
                        boxSizing: 'border-box',
                        margin: 0,
                        flex: 'none',
                        minWidth: 0,
                        border: '1px solid var(--gray-border)',
                        borderRadius: 6,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        color: 'var(--gray-dark)',
                        background: 'var(--white, #fff)',
                        outline: 'none',
                      }}
                      placeholder={String(baseline)}
                      value={draft[s.key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                    />
                    {isExtra ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '6px 8px', flexShrink: 0 }}
                        onClick={() => removeExtra(s.key)}
                        title="Remove partner"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--gray-border)',
                      background: 'var(--gray-light, #f5f5f5)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--gray-dark)',
                    }}
                  >
                    {formatPctPoints(s.sharePct, 0)}
                    {s.supplierOverride ? (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--amber, #d97706)',
                          fontFamily: 'inherit',
                        }}
                      >
                        override
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {addablePartners.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <select
                value={addPartnerKey}
                onChange={(e) => setAddPartnerKey(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--gray-border)',
                  minWidth: 200,
                }}
              >
                <option value="">Add commission partner…</option>
                {addablePartners.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                    {p.rate != null ? ` (${p.rate}%)` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-secondary"
                disabled={!addPartnerKey}
                onClick={addSelectedPartner}
                style={{ fontSize: 12 }}
              >
                Add
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--gray)' }}>
              All registered commission partners are listed, or add partners under Partners → Commission
              partners.
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save partner splits'}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={cancelEdit}>
              Cancel
            </button>
            {notice ? <span style={{ fontSize: 12, color: 'var(--gray)' }}>{notice}</span> : null}
          </div>
        </div>
      ) : notice ? (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--gray)' }}>{notice}</p>
      ) : null}
    </div>
  );
}

export default SupplierPartnerSplitsPanel;

/** @deprecated — type alias for Rates catalog share map */
export type PartnerShare = PartnerSplitRow & { key: ProviderRatePartnerKey | string };
