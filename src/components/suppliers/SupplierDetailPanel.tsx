'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAllCommissionPaySources, paySourceKey } from '@/lib/commission-partners';
import {
  customerRowsForProvider,
  removeSolutionProviderContact,
  removeSupplierSolution,
  upsertSolutionProviderContact,
  upsertSupplierSolution,
  type SolutionProviderRecord,
  type SupplierContact,
  type SupplierSolution,
} from '@/lib/solution-providers';
import { EditSupplierModal } from '@/components/suppliers/EditSupplierModal';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  boxSizing: 'border-box',
};

function ContactForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: SupplierContact;
  onSave: (c: Omit<SupplierContact, 'id'> & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState(initial?.role ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false);

  return (
    <div style={{ padding: 14, background: 'var(--gray-light)', borderRadius: 8, marginTop: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Role</label>
          <input value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 10 }}>
        <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
        Primary contact
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => onSave({ id: initial?.id, name, role, email, phone, isPrimary })}>Save contact</button>
        <button type="button" className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function SolutionForm({
  paySources,
  initial,
  onSave,
  onCancel,
}: {
  paySources: string[];
  initial?: SupplierSolution;
  onSave: (s: Omit<SupplierSolution, 'id'> & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const ps of paySources) {
      const val = initial?.partnerRates[paySourceKey(ps)];
      out[ps] = val != null ? String(val) : '';
    }
    return out;
  });

  const submit = () => {
    const partnerRates: Record<string, number> = {};
    for (const [ps, raw] of Object.entries(rates)) {
      if (!raw.trim()) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) partnerRates[paySourceKey(ps)] = n;
    }
    onSave({ id: initial?.id, name, description: description.trim() || undefined, partnerRates });
  };

  return (
    <div style={{ padding: 14, background: 'var(--gray-light)', borderRadius: 8, marginTop: 10 }}>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Solution / product</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fixed Wireless Broadband, UCaaS" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 8 }}>
        Candid commission rate by partner (%)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
        {paySources.map((ps) => (
          <div key={ps} style={{ display: 'contents' }}>
            <div style={{ fontSize: 12, padding: '8px 0' }}>{ps}</div>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={rates[ps] ?? ''}
              onChange={(e) => setRates((prev) => ({ ...prev, [ps]: e.target.value }))}
              placeholder="—"
              style={inputStyle}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={submit}>Save solution</button>
        <button type="button" className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function SupplierDetailPanel({
  provider,
  partners,
  onClose,
  onUpdated,
}: {
  provider: SolutionProviderRecord;
  partners: Parameters<typeof getAllCommissionPaySources>[0];
  onClose: () => void;
  onUpdated: (p: SolutionProviderRecord) => void;
}) {
  const [record, setRecord] = useState(provider);
  const [customerFilter, setCustomerFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editProvider, setEditProvider] = useState(false);
  const [contactForm, setContactForm] = useState<'add' | string | null>(null);
  const [solutionForm, setSolutionForm] = useState<'add' | string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setRecord(provider);
    setCustomerFilter('all');
    setEditProvider(false);
    setContactForm(null);
    setSolutionForm(null);
    setSaveError(null);
  }, [provider]);

  const paySources = useMemo(() => getAllCommissionPaySources(partners ?? []), [partners]);
  const customers = useMemo(() => customerRowsForProvider(record.name), [record.name]);
  const filteredCustomers = useMemo(() => {
    if (customerFilter === 'active') return customers.filter((c) => c.active);
    if (customerFilter === 'inactive') return customers.filter((c) => !c.active);
    return customers;
  }, [customers, customerFilter]);

  const activeCount = customers.filter((c) => c.active).length;
  const inactiveCount = customers.length - activeCount;

  const apply = async (promise: Promise<SolutionProviderRecord | null>) => {
    setSaving(true);
    setSaveError(null);
    try {
      const next = await promise;
      if (!next) return;
      setRecord(next);
      onUpdated(next);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card" style={{ marginTop: 0 }}>
        <div className="card-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="card-title">{record.displayName ?? record.name}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
              Solution provider / vendor · {customers.length} customer deal{customers.length === 1 ? '' : 's'}
              {record.fromBmwOnly ? ' · from BMW master (edit to save)' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditProvider(true)}>Edit provider</button>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: 18 }}>✕</button>
          </div>
        </div>

        <div className="card-body">
          {saveError && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{saveError}</p>}
          {/* Contacts */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)' }}>Contacts</div>
              <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => setContactForm('add')}>+ Add contact</button>
            </div>
            {record.contacts.length === 0 && contactForm !== 'add' && (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>No contacts yet.</p>
            )}
            {record.contacts.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--gray-border)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {c.name}
                    {c.isPrimary && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>PRIMARY</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray)' }}>{c.role || '—'}</div>
                  <div style={{ fontSize: 12 }}>{c.email} {c.phone ? `· ${c.phone}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setContactForm(c.id)}>Edit</button>
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} disabled={saving} onClick={() => void apply(removeSolutionProviderContact(record.id, c.id))}>Remove</button>
                </div>
              </div>
            ))}
            {contactForm === 'add' && (
              <ContactForm
                onSave={(c) => { void apply(upsertSolutionProviderContact(record.id, c).then((r) => { setContactForm(null); return r; })); }}
                onCancel={() => setContactForm(null)}
              />
            )}
            {contactForm && contactForm !== 'add' && (
              <ContactForm
                initial={record.contacts.find((c) => c.id === contactForm)}
                onSave={(c) => { void apply(upsertSolutionProviderContact(record.id, c).then((r) => { setContactForm(null); return r; })); }}
                onCancel={() => setContactForm(null)}
              />
            )}
          </div>

          {/* Solutions */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)' }}>Solutions & commission rates</div>
              <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => setSolutionForm('add')}>+ Add solution</button>
            </div>
            {record.solutions.length === 0 && solutionForm !== 'add' && (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>No solutions configured. Rates from BMW deals are seeded when available.</p>
            )}
            {record.solutions.map((s) => (
              <div key={s.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--gray-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                    {s.description && <div style={{ fontSize: 12, color: 'var(--gray)' }}>{s.description}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setSolutionForm(s.id)}>Edit rates</button>
                    <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} disabled={saving} onClick={() => void apply(removeSupplierSolution(record.id, s.id))}>Remove</button>
                  </div>
                </div>
                {Object.keys(s.partnerRates).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {Object.entries(s.partnerRates).map(([psKey, rate]) => {
                      const label = paySources.find((p) => paySourceKey(p) === psKey) ?? psKey;
                      return (
                        <span key={psKey} style={{ fontSize: 11, background: 'var(--gray-light)', border: '1px solid var(--gray-border)', borderRadius: 20, padding: '3px 10px' }}>
                          {label}: {rate}%
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {solutionForm === 'add' && (
              <SolutionForm
                paySources={paySources}
                onSave={(s) => { void apply(upsertSupplierSolution(record.id, s).then((r) => { setSolutionForm(null); return r; })); }}
                onCancel={() => setSolutionForm(null)}
              />
            )}
            {solutionForm && solutionForm !== 'add' && (
              <SolutionForm
                paySources={paySources}
                initial={record.solutions.find((s) => s.id === solutionForm)}
                onSave={(s) => { void apply(upsertSupplierSolution(record.id, s).then((r) => { setSolutionForm(null); return r; })); }}
                onCancel={() => setSolutionForm(null)}
              />
            )}
          </div>

          {/* Customers */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)' }}>
                Customers ({activeCount} active · {inactiveCount} inactive)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['all', 'active', 'inactive'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`comm-tab${customerFilter === f ? ' active' : ''}`}
                    style={{ padding: '4px 12px', fontSize: 11 }}
                    onClick={() => setCustomerFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>
            {filteredCustomers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>No matching customer deals.</p>
            ) : (
              <table className="admin-mini-table">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Commission partner</th>
                    <th>Solution</th>
                    <th>Agent</th>
                    <th>Deal ID</th>
                    <th>Rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((row, i) => (
                    <tr key={`${row.dealUid}-${i}`}>
                      <td>{row.merchant}</td>
                      <td style={{ fontSize: 12 }}>{row.paySource}</td>
                      <td style={{ fontSize: 12 }}>{row.product}</td>
                      <td style={{ fontSize: 12 }}>{row.agentCommId || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.dealUid || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {row.rate != null ? `${row.rate <= 1 ? Math.round(row.rate * 10000) / 100 : row.rate}%` : '—'}
                      </td>
                      <td style={{ fontSize: 11, fontWeight: 600, color: row.active ? 'var(--green)' : 'var(--gray)' }}>
                        {row.active ? 'Active' : 'Inactive'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {editProvider && (
        <EditSupplierModal
          provider={record}
          onClose={() => setEditProvider(false)}
          onSave={async (next) => { setRecord(next); onUpdated(next); setEditProvider(false); }}
        />
      )}
    </div>
  );
}

export default SupplierDetailPanel;
