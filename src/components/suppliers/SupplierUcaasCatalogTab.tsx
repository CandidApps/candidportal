'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SolutionProviderRecord } from '@/lib/solution-providers';
import type {
  UcaasCatalog,
  UcaasCatalogFee,
  UcaasCatalogItem,
  UcaasCatalogRecord,
} from '@/lib/ucaas/types';
import {
  createUcaasCatalog,
  deleteUcaasCatalog,
  fetchUcaasCatalogs,
  updateUcaasCatalog,
} from '@/lib/ucaas/catalogs-client';

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function slugId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `item_${Math.random().toString(36).slice(2, 7)}`
  );
}

const EMPTY_CATALOG: UcaasCatalog = {
  items: [],
  fees: [],
  tax: { monthlyTaxRatePct: 35, setupTaxLabels: ['State – Sales Tax', 'County – Transit Tax'] },
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 12,
  boxSizing: 'border-box',
};

export function SupplierUcaasCatalogTab({ provider }: { provider: SolutionProviderRecord }) {
  const [catalogs, setCatalogs] = useState<UcaasCatalogRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [catalog, setCatalog] = useState<UcaasCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const loadInto = useCallback((rec: UcaasCatalogRecord | null) => {
    setSelectedId(rec?.id ?? '');
    setName(rec?.name ?? '');
    setCatalog(rec?.catalog ?? EMPTY_CATALOG);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchUcaasCatalogs(provider.id);
      setCatalogs(rows);
      const def = rows.find((r) => r.isDefault) ?? rows[0] ?? null;
      loadInto(def);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalogs');
    } finally {
      setLoading(false);
    }
  }, [provider.id, loadInto]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setItems = (items: UcaasCatalogItem[]) => setCatalog((c) => ({ ...c, items }));
  const setFees = (fees: UcaasCatalogFee[]) => setCatalog((c) => ({ ...c, fees }));

  const updateItem = (id: string, patch: Partial<UcaasCatalogItem>) =>
    setItems(catalog.items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const addItem = (section: 'setup' | 'monthly') =>
    setItems([
      ...catalog.items,
      {
        id: slugId(`new ${section} ${catalog.items.length + 1}`),
        section,
        name: '',
        unitPrice: 0,
        defaultQuantity: 0,
      },
    ]);

  const removeItem = (id: string) => setItems(catalog.items.filter((it) => it.id !== id));

  const updateFee = (id: string, patch: Partial<UcaasCatalogFee>) =>
    setFees(catalog.fees.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const addFee = () =>
    setFees([
      ...catalog.fees,
      {
        id: slugId(`fee ${catalog.fees.length + 1}`),
        name: '',
        section: 'monthly',
        perUnit: 0,
        driverItemIds: [],
      },
    ]);

  const removeFee = (id: string) => setFees(catalog.fees.filter((f) => f.id !== id));

  const save = async () => {
    if (!name.trim()) {
      setError('Catalog name is required');
      return;
    }
    setSaving(true);
    setError('');
    setNote('');
    try {
      const cleaned: UcaasCatalog = {
        ...catalog,
        items: catalog.items
          .filter((it) => it.name.trim())
          .map((it) => ({ ...it, id: it.id || slugId(it.name) })),
        fees: catalog.fees.filter((f) => f.name.trim()),
      };
      if (selectedId) {
        await updateUcaasCatalog({ catalogId: selectedId, name: name.trim(), catalog: cleaned });
      } else {
        await createUcaasCatalog({ providerId: provider.id, name: name.trim(), catalog: cleaned });
      }
      setNote('Catalog saved.');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save catalog');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !window.confirm('Delete this catalog?')) return;
    setSaving(true);
    try {
      await deleteUcaasCatalog(selectedId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete catalog');
    } finally {
      setSaving(false);
    }
  };

  const monthlyItems = catalog.items.filter((it) => it.section === 'monthly');
  const driverOptions = monthlyItems.filter((it) => it.name.trim());

  if (loading) return <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading catalogs…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>UCaaS quote catalog</div>
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
            Products, fees, and tax rules reps use to build {provider.displayName ?? provider.name} quotes for customers.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {catalogs.length > 0 && (
            <select
              value={selectedId}
              onChange={(e) => loadInto(catalogs.find((c) => c.id === e.target.value) ?? null)}
              style={{ ...inputStyle, width: 'auto', fontSize: 13 }}
            >
              {catalogs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => loadInto(null)}>
            + New catalog
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 6, background: '#FEF2F2', color: 'var(--red)', fontSize: 13 }}>{error}</div>
      )}
      {note && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 6, background: 'var(--green-light, #ecfdf5)', color: 'var(--green)', fontSize: 13 }}>{note}</div>
      )}

      <label style={{ display: 'block', marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Catalog name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, fontSize: 14, marginTop: 4 }} />
      </label>

      {(['setup', 'monthly'] as const).map((section) => (
        <div key={section} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {section === 'setup' ? 'One-time setup items' : 'Recurring monthly items'}
            </div>
            <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => addItem(section)}>
              + Add item
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--gray)' }}>
                <th style={{ padding: '4px 6px' }}>Name</th>
                <th style={{ padding: '4px 6px', width: 110 }}>Unit price</th>
                <th style={{ padding: '4px 6px', width: 90 }}>Default qty</th>
                <th style={{ padding: '4px 6px', width: 60 }}>Flat</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {catalog.items.filter((it) => it.section === section).map((it) => (
                <tr key={it.id}>
                  <td style={{ padding: '3px 6px' }}>
                    <input value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} style={inputStyle} />
                  </td>
                  <td style={{ padding: '3px 6px' }}>
                    <input type="number" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(it.id, { unitPrice: num(e.target.value) })} style={inputStyle} />
                  </td>
                  <td style={{ padding: '3px 6px' }}>
                    <input type="number" value={it.defaultQuantity} onChange={(e) => updateItem(it.id, { defaultQuantity: num(e.target.value) })} style={inputStyle} />
                  </td>
                  <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                    <input type="checkbox" checked={Boolean(it.flat)} onChange={(e) => updateItem(it.id, { flat: e.target.checked })} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" onClick={() => removeItem(it.id)} title="Remove" style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Fees */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Computed fees</div>
          <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={addFee}>+ Add fee</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 8 }}>
          Fee = per-unit amount × the total quantity of the selected driver items.
        </div>
        {catalog.fees.map((f) => (
          <div key={f.id} style={{ border: '1px solid var(--gray-border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 36px', gap: 8, marginBottom: 8 }}>
              <input placeholder="Fee name" value={f.name} onChange={(e) => updateFee(f.id, { name: e.target.value })} style={inputStyle} />
              <input type="number" step="0.01" placeholder="Per unit" value={f.perUnit} onChange={(e) => updateFee(f.id, { perUnit: num(e.target.value) })} style={inputStyle} />
              <button type="button" onClick={() => removeFee(f.id)} title="Remove" style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>Driver items</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {driverOptions.map((it) => {
                const checked = f.driverItemIds.includes(it.id);
                return (
                  <label key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        updateFee(f.id, {
                          driverItemIds: e.target.checked
                            ? [...f.driverItemIds, it.id]
                            : f.driverItemIds.filter((d) => d !== it.id),
                        })
                      }
                    />
                    {it.name}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Tax */}
      <div style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'end' }}>
        <label>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Monthly tax estimate (%)</span>
          <input
            type="number"
            step="0.1"
            value={catalog.tax.monthlyTaxRatePct}
            onChange={(e) => setCatalog((c) => ({ ...c, tax: { ...c.tax, monthlyTaxRatePct: num(e.target.value) } }))}
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
        <label>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Setup tax line labels (comma separated)</span>
          <input
            value={catalog.tax.setupTaxLabels.join(', ')}
            onChange={(e) =>
              setCatalog((c) => ({
                ...c,
                tax: { ...c.tax, setupTaxLabels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) },
              }))
            }
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-primary" style={{ fontSize: 13 }} disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : selectedId ? 'Save catalog' : 'Create catalog'}
        </button>
        {selectedId && (
          <button type="button" className="btn-secondary" style={{ fontSize: 13 }} disabled={saving} onClick={() => void remove()}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
