'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildCommissionPartnerRows,
  dealsForPaySource,
  type CommissionPartnerRow,
} from '@/lib/commission-partners';
import {
  loadSolutionProviders,
  onSolutionProvidersUpdated,
  dealsForProvider,
  getSolutionProvider,
  type SolutionProviderRecord,
} from '@/lib/solution-providers';
import { fetchPartnerSuppliers, type PartnerSupplierRecord } from '@/lib/services/bank-deposits';
import { EditCommissionPartnerModal } from '@/components/suppliers/EditCommissionPartnerModal';
import { EditSupplierModal } from '@/components/suppliers/EditSupplierModal';
import { SupplierDetailPanel } from '@/components/suppliers/SupplierDetailPanel';

type PartnersTab = 'commission' | 'suppliers';

function Chevron({ open }: { open: boolean }) {
  return <span className={`comm-chevron${open ? ' open' : ''}`} aria-hidden>▶</span>;
}

function CommissionPartnerTable({
  rows,
  expandedPaySource,
  onToggle,
  onEdit,
}: {
  rows: CommissionPartnerRow[];
  expandedPaySource: string | null;
  onToggle: (paySource: string | null) => void;
  onEdit: (row: CommissionPartnerRow) => void;
}) {
  if (!rows.length) {
    return <p style={{ padding: '20px 16px', fontSize: 13, color: 'var(--gray)' }}>No commission partners found.</p>;
  }

  return (
    <table className="admin-mini-table comm-table">
      <thead>
        <tr>
          <th style={{ width: 36 }} />
          <th>Commission partner</th>
          <th>Residual import</th>
          <th>Bank ORIG name</th>
          <th>Bank ORIG ID</th>
          <th>Contact</th>
          <th style={{ textAlign: 'right' }}>Customers</th>
          <th style={{ width: 72 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const customers = dealsForPaySource(row.paySource);
          const isOpen = expandedPaySource === row.paySource;

          return (
            <Fragment key={row.paySource}>
              <tr className="comm-row-clickable" onClick={() => onToggle(isOpen ? null : row.paySource)}>
                <td><Chevron open={isOpen} /></td>
                <td style={{ fontWeight: 600 }}>{row.paySource}</td>
                <td style={{ fontSize: 12 }}>
                  {row.hasResidualImport ? (
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>Yes</span>
                  ) : (
                    <span style={{ color: 'var(--gray)' }}>Pay source only</span>
                  )}
                </td>
                <td style={{ fontSize: 12 }}>{row.bankOrigCoName ?? '—'}</td>
                <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{row.bankOrigId ?? '—'}</td>
                <td style={{ fontSize: 12 }}>
                  {row.contactName && <div>{row.contactName}</div>}
                  {row.contactEmail && <div style={{ color: 'var(--gray)' }}>{row.contactEmail}</div>}
                  {!row.contactName && !row.contactEmail && '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{customers.length}</td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onEdit(row)}>Edit</button>
                </td>
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan={8} style={{ padding: 0, background: 'var(--gray-light)' }}>
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 10 }}>
                        Customers via {row.paySource} ({customers.length})
                      </div>
                      {customers.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--gray)' }}>No BMW deals with this pay source.</p>
                      ) : (
                        <table className="admin-mini-table">
                          <thead>
                            <tr>
                              <th>Merchant</th>
                              <th>Provider</th>
                              <th>Solution</th>
                              <th>Agent</th>
                              <th>Deal UID</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customers.map((deal) => (
                              <tr key={deal.rowNum}>
                                <td>{deal.merchant}</td>
                                <td style={{ fontSize: 12 }}>{deal.provider || '—'}</td>
                                <td style={{ fontSize: 12 }}>{deal.product || deal.serviceDescription || '—'}</td>
                                <td style={{ fontSize: 12 }}>{deal.agentCommId || '—'}</td>
                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{deal.dealUid}</td>
                                <td style={{ fontSize: 11, fontWeight: 600, color: deal.activeDeal ? 'var(--green)' : 'var(--gray)' }}>
                                  {deal.activeDeal ? 'Active' : 'Inactive'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export function SuppliersView() {
  const [partners, setPartners] = useState<PartnerSupplierRecord[]>([]);
  const [providers, setProviders] = useState<SolutionProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PartnersTab>('commission');
  const [expandedPaySource, setExpandedPaySource] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [editProviderRecord, setEditProviderRecord] = useState<SolutionProviderRecord | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const [editPartner, setEditPartner] = useState<CommissionPartnerRow | null>(null);
  const [addProvider, setAddProvider] = useState(false);

  const refreshPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPartners(await fetchPartnerSuppliers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partners');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProviders = useCallback(async () => {
    setProviders(await loadSolutionProviders());
  }, []);

  useEffect(() => {
    void refreshPartners();
    void refreshProviders();
  }, [refreshPartners, refreshProviders]);

  useEffect(() => onSolutionProvidersUpdated(refreshProviders), [refreshProviders]);

  useEffect(() => {
    if (tab !== 'suppliers') {
      setSelectedProviderId(null);
      setEditProviderRecord(null);
    }
  }, [tab]);

  const commissionRows = useMemo(() => buildCommissionPartnerRows(partners), [partners]);

  const filteredProviders = useMemo(() => {
    const q = providerSearch.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) =>
      (p.displayName ?? p.name).toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q),
    );
  }, [providers, providerSearch]);

  const selectedProvider = useMemo(() => {
    if (!selectedProviderId) return null;
    return (
      providers.find((p) => p.id === selectedProviderId) ??
      getSolutionProvider(selectedProviderId)
    );
  }, [providers, selectedProviderId]);

  const openProviderDetail = useCallback((provider: SolutionProviderRecord) => {
    setSelectedProviderId(provider.id);
  }, []);

  const commissionCustomerCount = useMemo(
    () => commissionRows.reduce((sum, row) => sum + dealsForPaySource(row.paySource).length, 0),
    [commissionRows],
  );

  const supplierCustomerCount = useMemo(() => {
    const seen = new Set<string>();
    for (const p of providers) {
      for (const row of dealsForProvider(p.name)) {
        seen.add(`${row.merchant}-${row.dealUid}`);
      }
    }
    return seen.size;
  }, [providers]);

  if (loading) {
    return <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading partners…</p>;
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--amber-light)', color: 'var(--amber)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="comm-tabs">
        <button
          type="button"
          className={`comm-tab${tab === 'commission' ? ' active' : ''}`}
          onClick={() => { setTab('commission'); setSelectedProviderId(null); }}
        >
          Commission Partners
        </button>
        <button
          type="button"
          className={`comm-tab${tab === 'suppliers' ? ' active' : ''}`}
          onClick={() => { setTab('suppliers'); setExpandedPaySource(null); }}
        >
          Suppliers & Vendors
        </button>
      </div>

      {tab === 'commission' ? (
        <>
          <div className="comm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="comm-stat-card">
              <div className="comm-stat-label">Commission partners</div>
              <div className="comm-stat-value">{commissionRows.length}</div>
              <div className="comm-stat-sub">Pay sources & bank deposit sources</div>
            </div>
            <div className="comm-stat-card">
              <div className="comm-stat-label">Bank profiles</div>
              <div className="comm-stat-value">{commissionRows.filter((r) => r.partner).length}</div>
              <div className="comm-stat-sub">Deposit match configured</div>
            </div>
            <div className="comm-stat-card">
              <div className="comm-stat-label">Customer deals</div>
              <div className="comm-stat-value">{commissionCustomerCount}</div>
              <div className="comm-stat-sub">By pay source</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Commission partners</div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
                  Partners who pay Candid — pay sources from BMW deals, bank reports, and deposit matching (includes Candid)
                </div>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <CommissionPartnerTable
                rows={commissionRows}
                expandedPaySource={expandedPaySource}
                onToggle={setExpandedPaySource}
                onEdit={setEditPartner}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="comm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="comm-stat-card">
              <div className="comm-stat-label">Suppliers & vendors</div>
              <div className="comm-stat-value">{providers.length}</div>
              <div className="comm-stat-sub">Solution providers in BMW master</div>
            </div>
            <div className="comm-stat-card">
              <div className="comm-stat-label">With solutions</div>
              <div className="comm-stat-value">{providers.filter((p) => p.solutions.length > 0).length}</div>
              <div className="comm-stat-sub">Commission rates configured</div>
            </div>
            <div className="comm-stat-card">
              <div className="comm-stat-label">Customer deals</div>
              <div className="comm-stat-value">{supplierCustomerCount}</div>
              <div className="comm-stat-sub">Across all providers</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="card-title">Suppliers & vendors</div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
                  Actual solution providers (Comcast, Dialpad, Vonage, etc.) — sold through commission partners like Telarus
                </div>
              </div>
              <input
                type="search"
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                placeholder="Search providers…"
                style={{ border: '1px solid var(--gray-border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, width: 220 }}
              />
              <button type="button" className="btn-primary" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => setAddProvider(true)}>
                + Add provider
              </button>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {filteredProviders.length === 0 ? (
                <p style={{ padding: '20px 16px', fontSize: 13, color: 'var(--gray)' }}>No providers match your search.</p>
              ) : (
                <table className="admin-mini-table comm-table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Solutions</th>
                      <th>Contacts</th>
                      <th style={{ textAlign: 'right' }}>Customers</th>
                      <th style={{ width: 120 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProviders.map((p) => {
                      const customerCount = dealsForProvider(p.name).length;
                      return (
                        <tr
                          key={p.id}
                          className="comm-row-clickable"
                          style={selectedProviderId === p.id ? { background: 'var(--gray-light)' } : undefined}
                          onClick={() => openProviderDetail(p)}
                        >
                          <td style={{ fontWeight: 600 }}>
                            {p.displayName ?? p.name}
                            {p.fromBmwOnly && (
                              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--gray)', fontWeight: 500 }}>BMW</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12 }}>{p.solutions.length}</td>
                          <td style={{ fontSize: 12 }}>{p.contacts.length}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{customerCount}</td>
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ fontSize: 11, padding: '4px 10px', flex: 'none' }}
                                onClick={() => openProviderDetail(p)}
                              >
                                View
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ fontSize: 11, padding: '4px 10px', flex: 'none' }}
                                onClick={() => setEditProviderRecord(p)}
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {selectedProvider && tab === 'suppliers' && (
        <div
          role="dialog"
          aria-modal
          aria-label={`${selectedProvider.displayName ?? selectedProvider.name} details`}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedProviderId(null); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 700,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: 24,
            overflowY: 'auto',
          }}
        >
          <div style={{ width: 'min(920px, 95vw)', margin: '24px 0' }}>
            <SupplierDetailPanel
              key={selectedProvider.id}
              provider={selectedProvider}
              partners={partners}
              onClose={() => setSelectedProviderId(null)}
              onUpdated={(next) => {
                void refreshProviders().then(() => setSelectedProviderId(next.id));
              }}
            />
          </div>
        </div>
      )}

      {editPartner && (
        <EditCommissionPartnerModal
          row={editPartner}
          onClose={() => setEditPartner(null)}
          onSave={() => { setEditPartner(null); void refreshPartners(); }}
        />
      )}

      {editProviderRecord && (
        <EditSupplierModal
          provider={editProviderRecord}
          onClose={() => setEditProviderRecord(null)}
          onSave={(next) => {
            void refreshProviders().then(() => {
              setEditProviderRecord(null);
              setSelectedProviderId(next.id);
            });
          }}
        />
      )}

      {addProvider && (
        <EditSupplierModal
          provider={null}
          initialName={providerSearch}
          onClose={() => setAddProvider(false)}
          onSave={(next) => {
            void refreshProviders().then(() => {
              setSelectedProviderId(next.id);
              setAddProvider(false);
            });
          }}
        />
      )}
    </div>
  );
}

export default SuppliersView;
