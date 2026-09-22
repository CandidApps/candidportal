'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  PROVIDER_RATE_PARTNERS,
  computeCandidNetPct,
  effectivePartnerNet,
  formatPctPoints,
  parseNetOverrides,
  type NetOverridesMap,
  type ProviderRatePartnerKey,
} from '@/lib/provider-rate-nets';

type DryProduct = {
  id: number;
  sheet_row: number;
  provider_slug: string;
  category: string | null;
  product_name: string;
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
  note: string | null;
  renewal_scope: string | null;
  pays_on_renewals: boolean | null;
  payment_basis: string | null;
  paid_on_basis: string | null;
  evergreen_strength: string | null;
  first_commission_timing: string | null;
  upfront_summary: string | null;
  exclusions_summary: string | null;
  partner_network: string | null;
  term_length: string | null;
  net_overrides?: NetOverridesMap | null;
};

type PartnerShare = {
  key: ProviderRatePartnerKey;
  label: string;
  short: string;
  sharePct: number;
  defaultSharePct: number;
};

type PartnerRowState = {
  key: ProviderRatePartnerKey;
  supported: boolean;
  override: boolean;
  overrideNet: string;
};

type EditForm = {
  provider_slug: string;
  product_name: string;
  category: string;
  gross_rate_pct: string;
  note: string;
  payment_basis: string;
  paid_on_basis: string;
  renewal_scope: string;
  term_length: string;
  evergreen_strength: string;
  first_commission_timing: string;
  partner_network: string;
  upfront_summary: string;
  exclusions_summary: string;
  pays_on_renewals: boolean | null;
  partners: PartnerRowState[];
};

const fieldStyle: CSSProperties = { display: 'grid', gap: 4, marginBottom: 12 };
const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--gray)',
};
const sectionTitle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--gray)',
  margin: '18px 0 10px',
};

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function yn(v: boolean | null | undefined) {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '—';
}

function shareByKey(shares: PartnerShare[]): Record<ProviderRatePartnerKey, number> {
  const out = {} as Record<ProviderRatePartnerKey, number>;
  for (const def of PROVIDER_RATE_PARTNERS) {
    const hit = shares.find((s) => s.key === def.key);
    out[def.key] = hit?.sharePct ?? def.defaultSharePct;
  }
  return out;
}

function partnersFromProduct(p: DryProduct | null, shares: PartnerShare[]): PartnerRowState[] {
  const shareMap = shareByKey(shares);
  const overrides = parseNetOverrides(p?.net_overrides);
  return PROVIDER_RATE_PARTNERS.map((def) => {
    const supported = Boolean(p?.[def.supportedField]);
    const storedNet = p?.[def.netField] ?? null;
    const eff = effectivePartnerNet({
      key: def.key,
      grossPct: p?.gross_rate_pct,
      sharePct: shareMap[def.key],
      storedNet,
      overrides,
    });
    return {
      key: def.key,
      supported,
      override: eff.isOverride,
      overrideNet: eff.isOverride && eff.net != null ? String(eff.net) : '',
    };
  });
}

function emptyPartners(): PartnerRowState[] {
  return PROVIDER_RATE_PARTNERS.map((def) => ({
    key: def.key,
    supported: false,
    override: false,
    overrideNet: '',
  }));
}

function toForm(
  p: DryProduct | null,
  shares: PartnerShare[],
  defaults?: { category?: string; provider_slug?: string },
): EditForm {
  return {
    provider_slug: p?.provider_slug ?? defaults?.provider_slug ?? '',
    product_name: p?.product_name ?? '',
    category: p?.category ?? defaults?.category ?? '',
    gross_rate_pct: p?.gross_rate_pct != null ? String(p.gross_rate_pct) : '',
    note: p?.note ?? '',
    payment_basis: p?.payment_basis ?? '',
    paid_on_basis: p?.paid_on_basis ?? '',
    renewal_scope: p?.renewal_scope ?? '',
    term_length: p?.term_length ?? '',
    evergreen_strength: p?.evergreen_strength ?? '',
    first_commission_timing: p?.first_commission_timing ?? '',
    partner_network: p?.partner_network ?? '',
    upfront_summary: p?.upfront_summary ?? '',
    exclusions_summary: p?.exclusions_summary ?? '',
    pays_on_renewals: p?.pays_on_renewals ?? null,
    partners: p ? partnersFromProduct(p, shares) : emptyPartners(),
  };
}

function PartnerNetsTable({
  grossPct,
  shares,
  partners,
  editable,
  onChange,
}: {
  grossPct: number | null;
  shares: PartnerShare[];
  partners: PartnerRowState[];
  editable: boolean;
  onChange?: (next: PartnerRowState[]) => void;
}) {
  const shareMap = shareByKey(shares);

  const setRow = (key: ProviderRatePartnerKey, patch: Partial<PartnerRowState>) => {
    if (!onChange) return;
    onChange(partners.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--gray-border)', borderRadius: 8 }}>
      <table className="admin-mini-table" style={{ margin: 0, minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Partner</th>
            <th>Supported</th>
            <th>Candid share</th>
            <th>Net</th>
            <th>Override</th>
          </tr>
        </thead>
        <tbody>
          {PROVIDER_RATE_PARTNERS.map((def) => {
            const row = partners.find((p) => p.key === def.key) ?? {
              key: def.key,
              supported: false,
              override: false,
              overrideNet: '',
            };
            const share = shareMap[def.key];
            const computed = computeCandidNetPct(grossPct, share);
            const displayNet = row.override
              ? numOrNull(row.overrideNet) ?? computed
              : computed;

            return (
              <tr key={def.key} style={{ opacity: row.supported || editable ? 1 : 0.55 }}>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{def.label}</td>
                <td style={{ textAlign: 'center' }}>
                  {editable ? (
                    <input
                      type="checkbox"
                      checked={row.supported}
                      onChange={(e) => setRow(def.key, { supported: e.target.checked })}
                    />
                  ) : (
                    yn(row.supported)
                  )}
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {formatPctPoints(share, 0)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {editable && row.override ? (
                    <input
                      className="roadmap-input"
                      style={{ width: 72, textAlign: 'center', padding: '4px 6px' }}
                      value={row.overrideNet}
                      placeholder={computed != null ? String(computed) : ''}
                      onChange={(e) => setRow(def.key, { overrideNet: e.target.value })}
                    />
                  ) : (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {formatPctPoints(displayNet)}
                      {row.override ? (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--amber, #d97706)' }}>
                          override
                        </span>
                      ) : null}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {editable ? (
                    <input
                      type="checkbox"
                      checked={row.override}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setRow(def.key, {
                          override: on,
                          overrideNet: on
                            ? row.overrideNet || (computed != null ? String(computed) : '')
                            : '',
                        });
                      }}
                    />
                  ) : row.override ? (
                    'Yes'
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EarningsDryRunCatalogView({
  providerSlug,
  providerName,
  embedded = false,
}: {
  providerSlug?: string;
  providerName?: string;
  embedded?: boolean;
} = {}) {
  const lockedToProvider = Boolean(providerSlug || providerName);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [partner, setPartner] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [partnerShares, setPartnerShares] = useState<PartnerShare[]>([]);
  const [providerCount, setProviderCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [resolvedSlug, setResolvedSlug] = useState<string | null>(null);
  const [products, setProducts] = useState<DryProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<DryProduct | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<EditForm>(() => toForm(null, []));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const limit = 75;

  const shareMap = useMemo(() => shareByKey(partnerShares), [partnerShares]);

  const loadSummary = useCallback(async () => {
    const params = new URLSearchParams({ mode: 'summary' });
    if (providerSlug) params.set('provider', providerSlug);
    if (providerName) params.set('providerName', providerName);
    const res = await fetch(`/api/admin/earnings-dry-run?${params}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load summary');
    setProviderCount(data.providerCount ?? 0);
    setProductCount(data.productCount ?? 0);
    setCategories(data.categories ?? []);
    setResolvedSlug(data.resolvedProviderSlug ?? null);
    if (data.partnerShares) setPartnerShares(data.partnerShares);
  }, [providerSlug, providerName]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (q.trim()) params.set('q', q.trim());
      if (category) params.set('category', category);
      if (partner) params.set('partner', partner);
      if (providerSlug) params.set('provider', providerSlug);
      if (providerName) params.set('providerName', providerName);
      const res = await fetch(`/api/admin/earnings-dry-run?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load products');
      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
      if (data.resolvedProviderSlug) setResolvedSlug(data.resolvedProviderSlug);
      if (data.partnerShares) setPartnerShares(data.partnerShares);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, category, partner, offset, providerSlug, providerName]);

  useEffect(() => {
    void loadSummary().catch((e) => setError(e instanceof Error ? e.message : 'Summary failed'));
  }, [loadSummary]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const openEdit = (p: DryProduct) => {
    setSelected(p);
    setForm(toForm(p, partnerShares));
    setEditing(true);
    setAdding(false);
  };

  const openAdd = () => {
    setSelected(null);
    setForm(
      toForm(null, partnerShares, {
        category: categories[0] ?? '',
        provider_slug: resolvedSlug || providerSlug || '',
      }),
    );
    setAdding(true);
    setEditing(true);
  };

  const closeDrawer = () => {
    setSelected(null);
    setEditing(false);
    setAdding(false);
  };

  const setField = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const buildPayload = () => {
    const gross = numOrNull(form.gross_rate_pct);
    const overrides: NetOverridesMap = {};
    const supportedPatch: Record<string, boolean> = {};
    for (const def of PROVIDER_RATE_PARTNERS) {
      const row = form.partners.find((p) => p.key === def.key);
      supportedPatch[def.supportedField] = Boolean(row?.supported);
      if (row?.override) {
        const n = numOrNull(row.overrideNet);
        if (n != null) overrides[def.key] = n;
      }
    }
    return {
      product_name: form.product_name.trim(),
      category: form.category.trim() || null,
      gross_rate_pct: gross,
      note: form.note.trim() || null,
      payment_basis: form.payment_basis.trim() || null,
      paid_on_basis: form.paid_on_basis.trim() || null,
      renewal_scope: form.renewal_scope.trim() || null,
      term_length: form.term_length.trim() || null,
      evergreen_strength: form.evergreen_strength.trim() || null,
      first_commission_timing: form.first_commission_timing.trim() || null,
      partner_network: form.partner_network.trim() || null,
      upfront_summary: form.upfront_summary.trim() || null,
      exclusions_summary: form.exclusions_summary.trim() || null,
      pays_on_renewals: form.pays_on_renewals,
      net_overrides: overrides,
      ...supportedPatch,
    };
  };

  const saveProduct = async () => {
    const payload = buildPayload();
    if (!payload.product_name) {
      setError('Product name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (adding) {
        const slug = (form.provider_slug || resolvedSlug || providerSlug || '').trim().toLowerCase();
        if (!slug && !providerName) throw new Error('Provider slug is required');
        const res = await fetch('/api/admin/earnings-dry-run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_product',
            provider_slug: slug || undefined,
            provider_name: providerName,
            ...payload,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create');
        closeDrawer();
      } else if (selected) {
        const res = await fetch('/api/admin/earnings-dry-run', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selected.id, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save');
        setSelected(data.product);
        setEditing(false);
      }
      await Promise.all([loadSummary(), loadProducts()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async () => {
    if (!selected || !confirm(`Delete “${selected.product_name}”?`)) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/earnings-dry-run?id=${selected.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      closeDrawer();
      await Promise.all([loadSummary(), loadProducts()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const syncMissingSuppliers = async () => {
    setSyncing(true);
    setSyncMsg('');
    setError('');
    try {
      const res = await fetch('/api/admin/earnings-dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_missing_suppliers' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncMsg(data.message || `Added ${data.created} suppliers`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const selectedPartnerRows = selected
    ? partnersFromProduct(selected, partnerShares)
    : emptyPartners();

  return (
    <div>
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--amber-light)',
            color: 'var(--amber)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {syncMsg && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'color-mix(in srgb, var(--green, #16a34a) 12%, var(--page-bg-solid))',
            color: 'var(--gray-dark)',
            fontSize: 13,
          }}
        >
          {syncMsg}
        </div>
      )}

      {!embedded && (
        <div className="comm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="comm-stat-card">
            <div className="comm-stat-label">Providers</div>
            <div className="comm-stat-value">{providerCount}</div>
          </div>
          <div className="comm-stat-card">
            <div className="comm-stat-label">Products</div>
            <div className="comm-stat-value">{productCount}</div>
          </div>
          <div className="comm-stat-card">
            <div className="comm-stat-label">Filtered</div>
            <div className="comm-stat-value">{total}</div>
          </div>
        </div>
      )}

      {embedded && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, fontSize: 13 }}>
          <span>
            <strong>{productCount}</strong> products
          </span>
          <span style={{ color: 'var(--gray)' }}>
            Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
        </div>
      )}

      <div className="card" style={embedded ? { boxShadow: 'none', border: '1px solid var(--gray-border)' } : undefined}>
        <div className="card-header" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="card-title">
              {lockedToProvider ? 'Provider Rates' : 'Provider Rates catalog'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
              Gross residual, partner portfolio, Candid net by pay source
              {lockedToProvider
                ? ' · Nets = gross × each partner’s Candid commission rate (overridable).'
                : ''}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {!lockedToProvider && (
              <button
                type="button"
                className="btn-secondary"
                disabled={syncing}
                onClick={() => void syncMissingSuppliers()}
              >
                {syncing ? 'Adding suppliers…' : 'Add missing suppliers'}
              </button>
            )}
            <button type="button" className="btn-primary" onClick={openAdd}>
              Add product
            </button>
            <input
              className="roadmap-input"
              style={{ minWidth: 180 }}
              value={q}
              placeholder={lockedToProvider ? 'Search products…' : 'Search product / provider…'}
              onChange={(e) => {
                setOffset(0);
                setQ(e.target.value);
              }}
            />
            <select
              className="roadmap-select"
              value={category}
              onChange={(e) => {
                setOffset(0);
                setCategory(e.target.value);
              }}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="roadmap-select"
              value={partner}
              onChange={(e) => {
                setOffset(0);
                setPartner(e.target.value);
              }}
            >
              <option value="">All partners</option>
              <option value="intelisys">Intelisys</option>
              <option value="sandler">Sandler</option>
              <option value="telarus">Telarus</option>
              <option value="appdirect">AppDirect Telco</option>
              <option value="appdirect_saas">AppDirect SaaS</option>
            </select>
          </div>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <p style={{ padding: 16, color: 'var(--gray)', fontSize: 13 }}>Loading…</p>
          ) : products.length === 0 ? (
            <p style={{ padding: 16, color: 'var(--gray)', fontSize: 13 }}>No rows match.</p>
          ) : (
            <table className="admin-mini-table comm-table">
              <thead>
                <tr>
                  {!lockedToProvider && <th>Provider</th>}
                  <th>Product</th>
                  <th>Category</th>
                  <th>Gross</th>
                  <th>Partners</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const overrides = parseNetOverrides(p.net_overrides);
                  const supportedBits = PROVIDER_RATE_PARTNERS.filter((d) => p[d.supportedField]).map(
                    (d) => {
                      const eff = effectivePartnerNet({
                        key: d.key,
                        grossPct: p.gross_rate_pct,
                        sharePct: shareMap[d.key],
                        storedNet: p[d.netField],
                        overrides,
                      });
                      return `${d.short} ${formatPctPoints(eff.net, 0)}`;
                    },
                  );
                  return (
                    <tr
                      key={p.id}
                      className="comm-row-clickable"
                      onClick={() => {
                        setSelected(p);
                        setEditing(false);
                        setAdding(false);
                      }}
                    >
                      {!lockedToProvider && (
                        <td style={{ fontWeight: 600 }}>{p.provider_slug}</td>
                      )}
                      <td style={{ fontSize: 12 }}>{p.product_name}</td>
                      <td style={{ fontSize: 12, color: 'var(--gray)' }}>{p.category ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {formatPctPoints(p.gross_rate_pct)}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--gray)' }}>
                        {supportedBits.join(' · ') || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderTop: '1px solid var(--gray-border)',
            fontSize: 12,
            color: 'var(--gray)',
          }}
        >
          <span>
            Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          {(offset > 0 || offset + limit < total) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {offset > 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setOffset((o) => Math.max(0, o - limit))}
                >
                  Prev
                </button>
              )}
              {offset + limit < total && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setOffset((o) => o + limit)}
                >
                  Next
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {(selected || adding) && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(15,23,42,0.35)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={closeDrawer}
        >
          <div
            style={{
              width: 'min(560px, 100%)',
              height: '100%',
              background: 'var(--page-bg-solid)',
              borderLeft: '1px solid var(--gray-border)',
              padding: 24,
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="rates-drawer-header"
              style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}>
                  {adding
                    ? 'Add product'
                    : editing
                      ? 'Edit product'
                      : selected?.product_name}
                </h3>
                {!editing && selected && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--gray)' }}>
                    {[selected.category, selected.provider_slug].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn-secondary rates-drawer-close"
                style={{ flex: 'none', alignSelf: 'flex-start' }}
                onClick={closeDrawer}
              >
                Close
              </button>
            </div>

            {!editing && selected && (
              <>
                <div
                  className="rates-drawer-actions"
                  style={{ display: 'flex', gap: 8, margin: '12px 0 18px', flexWrap: 'wrap' }}
                >
                  <button type="button" className="btn-primary" onClick={() => openEdit(selected)}>
                    Edit
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => void deleteProduct()}>
                    Delete
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--gray-border)',
                      background: 'var(--surface-muted, transparent)',
                    }}
                  >
                    <div style={labelStyle}>Gross residual</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {formatPctPoints(selected.gross_rate_pct)}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--gray-border)',
                    }}
                  >
                    <div style={labelStyle}>Partner network</div>
                    <div style={{ fontSize: 15, marginTop: 4 }}>
                      {selected.partner_network || '—'}
                    </div>
                  </div>
                </div>

                <div style={sectionTitle}>Candid net by partner</div>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--gray)' }}>
                  Default = gross × Candid commission rate on the commission partner. Overrides are
                  for special supplier deals.
                </p>
                <PartnerNetsTable
                  grossPct={selected.gross_rate_pct}
                  shares={partnerShares}
                  partners={selectedPartnerRows}
                  editable={false}
                />

                <div style={sectionTitle}>Terms</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px 16px',
                    fontSize: 13,
                  }}
                >
                  {(
                    [
                      ['Payment basis', selected.payment_basis],
                      ['Paid on', selected.paid_on_basis],
                      ['Renewal scope', selected.renewal_scope],
                      ['Pays renewals', yn(selected.pays_on_renewals)],
                      ['Term', selected.term_length],
                      ['Evergreen', selected.evergreen_strength],
                      ['First commission', selected.first_commission_timing],
                    ] as [string, string | null][]
                  ).map(([label, value]) => (
                    <div key={label}>
                      <div style={labelStyle}>{label}</div>
                      <div style={{ marginTop: 2 }}>{value || '—'}</div>
                    </div>
                  ))}
                </div>

                {(selected.note || selected.upfront_summary || selected.exclusions_summary) && (
                  <>
                    <div style={sectionTitle}>Notes</div>
                    <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                      {selected.note && (
                        <div>
                          <div style={labelStyle}>Note</div>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{selected.note}</div>
                        </div>
                      )}
                      {selected.upfront_summary && (
                        <div>
                          <div style={labelStyle}>Upfront</div>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{selected.upfront_summary}</div>
                        </div>
                      )}
                      {selected.exclusions_summary && (
                        <div>
                          <div style={labelStyle}>Exclusions</div>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{selected.exclusions_summary}</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {editing && (
              <div>
                {adding && !lockedToProvider && (
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Provider slug</label>
                    <input
                      className="roadmap-input"
                      value={form.provider_slug}
                      onChange={(e) => setField('provider_slug', e.target.value)}
                    />
                  </div>
                )}
                <div style={fieldStyle}>
                  <label style={labelStyle}>Product name</label>
                  <input
                    className="roadmap-input"
                    value={form.product_name}
                    onChange={(e) => setField('product_name', e.target.value)}
                  />
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Category</label>
                    <input
                      className="roadmap-input"
                      list="dry-run-categories"
                      value={form.category}
                      onChange={(e) => setField('category', e.target.value)}
                    />
                    <datalist id="dry-run-categories">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Gross residual %</label>
                    <input
                      className="roadmap-input"
                      value={form.gross_rate_pct}
                      onChange={(e) => setField('gross_rate_pct', e.target.value)}
                      placeholder="e.g. 20"
                    />
                  </div>
                </div>

                <div style={sectionTitle}>Candid net by partner</div>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--gray)' }}>
                  Changing gross recalculates nets from each partner&apos;s Candid commission rate.
                  Check Override only for special deals.
                </p>
                <PartnerNetsTable
                  grossPct={numOrNull(form.gross_rate_pct)}
                  shares={partnerShares}
                  partners={form.partners}
                  editable
                  onChange={(partners) => setField('partners', partners)}
                />

                <div style={sectionTitle}>Terms</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  {(
                    [
                      ['payment_basis', 'Payment basis'],
                      ['paid_on_basis', 'Paid on'],
                      ['renewal_scope', 'Renewal scope'],
                      ['term_length', 'Term length'],
                      ['evergreen_strength', 'Evergreen'],
                      ['first_commission_timing', 'First commission'],
                      ['partner_network', 'Partner network'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} style={fieldStyle}>
                      <label style={labelStyle}>{label}</label>
                      <input
                        className="roadmap-input"
                        value={form[key]}
                        onChange={(e) => setField(key, e.target.value)}
                      />
                    </div>
                  ))}
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Pays on renewals</label>
                    <select
                      className="roadmap-select"
                      value={
                        form.pays_on_renewals == null ? '' : form.pays_on_renewals ? 'yes' : 'no'
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setField('pays_on_renewals', v === '' ? null : v === 'yes');
                      }}
                    >
                      <option value="">—</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>

                <div style={sectionTitle}>Notes</div>
                {(
                  [
                    ['note', 'Note'],
                    ['upfront_summary', 'Upfront summary'],
                    ['exclusions_summary', 'Exclusions'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} style={fieldStyle}>
                    <label style={labelStyle}>{label}</label>
                    <textarea
                      className="roadmap-input"
                      rows={2}
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                    />
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saving}
                    onClick={() => void saveProduct()}
                  >
                    {saving ? 'Saving…' : adding ? 'Create product' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={saving}
                    onClick={() => {
                      if (adding) closeDrawer();
                      else setEditing(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
