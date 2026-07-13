'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildCommissionPartnerRows,
  commissionSourceKey,
  dealsForPaySource,
  type CommissionPartnerRow,
} from '@/lib/commission-partners';
import {
  loadSolutionProviders,
  onSolutionProvidersUpdated,
  dealsForProvider,
  getSolutionProvider,
  preferSavedProvider,
  saveAllBmwSolutionProviders,
  type SolutionProviderRecord,
} from '@/lib/solution-providers';
import { providerCategoryLabel } from '@/lib/provider-categories';
import { fetchPartnerSuppliers, type PartnerSupplierRecord } from '@/lib/services/bank-deposits';
import { EditCommissionPartnerModal } from '@/components/suppliers/EditCommissionPartnerModal';
import { EditSupplierModal } from '@/components/suppliers/EditSupplierModal';
import { ImportExportControls } from '@/components/suppliers/ImportExportControls';
import { SupplierDetailPage } from '@/components/suppliers/SupplierDetailPage';
import { CommissionPartnerDetailPage } from '@/components/suppliers/CommissionPartnerDetailPage';
import {
  exportCommissionPartnersCsv,
  exportCommissionPartnersXlsx,
  importCommissionPartnersFromFile,
} from '@/lib/partners-spreadsheet';
import {
  exportSolutionProvidersCsv,
  exportSolutionProvidersXlsx,
  importSolutionProvidersFromFile,
} from '@/lib/suppliers-spreadsheet';
import { RegistryDocumentsSection } from '@/components/shared/RegistryDocumentsSection';

type PartnersTab = 'commission' | 'suppliers';

function Chevron({ open }: { open: boolean }) {
  return <span className={`comm-chevron${open ? ' open' : ''}`} aria-hidden>▶</span>;
}

function CommissionPartnerExpanded({
  row,
}: {
  row: CommissionPartnerRow;
}) {
  const [panel, setPanel] = useState<'customers' | 'documents'>('customers');
  const customers = dealsForPaySource(row.paySource);
  const entityKey = commissionSourceKey(row.paySource);

  return (
    <div style={{ padding: '16px 20px' }}>
      <div className="comm-tabs" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={`comm-tab${panel === 'customers' ? ' active' : ''}`}
          onClick={() => setPanel('customers')}
        >
          Customers ({customers.length})
        </button>
        <button
          type="button"
          className={`comm-tab${panel === 'documents' ? ' active' : ''}`}
          onClick={() => setPanel('documents')}
        >
          Documents
        </button>
      </div>

      {panel === 'customers' ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 10 }}>
            Customers via {row.paySource}
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
        </>
      ) : (
        <RegistryDocumentsSection
          embedded
          entityType="commission_partner"
          entityKey={entityKey}
          entityLabel={row.paySource}
        />
      )}
    </div>
  );
}

function CommissionPartnerTable({
  rows,
  expandedPaySource,
  onToggle,
  onView,
  onEdit,
}: {
  rows: CommissionPartnerRow[];
  expandedPaySource: string | null;
  onToggle: (paySource: string | null) => void;
  onView: (row: CommissionPartnerRow) => void;
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
          <th>Type</th>
          <th>Residual import</th>
          <th>Bank ORIG name</th>
          <th>Bank ORIG ID</th>
          <th>Contact</th>
          <th style={{ textAlign: 'right' }}>Customers</th>
          <th style={{ width: 120 }}>Actions</th>
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
                <td style={{ fontSize: 12, color: 'var(--gray)' }}>
                  {providerCategoryLabel(row.partner?.provider_category)}
                </td>
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
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px', flex: 'none' }}
                      onClick={() => onView(row)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px', flex: 'none' }}
                      onClick={() => onEdit(row)}
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan={9} style={{ padding: 0, background: 'var(--gray-light)' }}>
                    <CommissionPartnerExpanded row={row} />
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

type SuppliersViewProps = {
  selectedProviderId?: string | null;
  onSelectProvider?: (id: string | null) => void;
  selectedCommissionPartnerKey?: string | null;
  onSelectCommissionPartner?: (key: string | null) => void;
};

export function SuppliersView({
  selectedProviderId: selectedProviderIdProp,
  onSelectProvider,
  selectedCommissionPartnerKey: selectedCommissionPartnerKeyProp,
  onSelectCommissionPartner,
}: SuppliersViewProps = {}) {
  const [partners, setPartners] = useState<PartnerSupplierRecord[]>([]);
  const [providers, setProviders] = useState<SolutionProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PartnersTab>('commission');
  const [expandedPaySource, setExpandedPaySource] = useState<string | null>(null);
  const [selectedProviderIdInternal, setSelectedProviderIdInternal] = useState<string | null>(null);
  const selectedProviderId = selectedProviderIdProp !== undefined ? selectedProviderIdProp : selectedProviderIdInternal;
  const setSelectedProviderId = (id: string | null) => {
    if (onSelectProvider) onSelectProvider(id);
    else setSelectedProviderIdInternal(id);
  };
  const [selectedCommissionPartnerKeyInternal, setSelectedCommissionPartnerKeyInternal] = useState<string | null>(null);
  const selectedCommissionPartnerKey =
    selectedCommissionPartnerKeyProp !== undefined
      ? selectedCommissionPartnerKeyProp
      : selectedCommissionPartnerKeyInternal;
  const setSelectedCommissionPartnerKey = (key: string | null) => {
    if (onSelectCommissionPartner) onSelectCommissionPartner(key);
    else setSelectedCommissionPartnerKeyInternal(key);
  };
  const [editProviderRecord, setEditProviderRecord] = useState<SolutionProviderRecord | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const [editPartner, setEditPartner] = useState<CommissionPartnerRow | null>(null);
  const [addProvider, setAddProvider] = useState(false);
  const [savingBmwProviders, setSavingBmwProviders] = useState(false);
  const [bmwSaveMessage, setBmwSaveMessage] = useState<string | null>(null);

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

  // Open the matching tab when selection is driven from global search / parent.
  useEffect(() => {
    if (selectedProviderIdProp) setTab('suppliers');
  }, [selectedProviderIdProp]);

  useEffect(() => {
    if (selectedCommissionPartnerKeyProp) setTab('commission');
  }, [selectedCommissionPartnerKeyProp]);

  useEffect(() => {
    if (tab !== 'suppliers') {
      // Keep parent-driven selection until the tab sync effect switches tabs.
      if (selectedProviderIdProp) return;
      setSelectedProviderId(null);
      setEditProviderRecord(null);
    }
  }, [tab, selectedProviderIdProp]);

  useEffect(() => {
    if (tab !== 'commission') {
      if (selectedCommissionPartnerKeyProp) return;
      setSelectedCommissionPartnerKey(null);
      setExpandedPaySource(null);
    }
  }, [tab, selectedCommissionPartnerKeyProp]);

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
    const found =
      providers.find((p) => p.id === selectedProviderId) ??
      getSolutionProvider(selectedProviderId);
    return found ? preferSavedProvider(found, providers) : null;
  }, [providers, selectedProviderId]);

  const selectedCommissionPartner = useMemo(() => {
    if (!selectedCommissionPartnerKey) return null;
    return (
      commissionRows.find((row) => commissionSourceKey(row.paySource) === selectedCommissionPartnerKey) ??
      null
    );
  }, [commissionRows, selectedCommissionPartnerKey]);

  const openCommissionPartnerDetail = useCallback((row: CommissionPartnerRow) => {
    setSelectedCommissionPartnerKey(commissionSourceKey(row.paySource));
  }, []);

  const openProviderDetail = useCallback((provider: SolutionProviderRecord) => {
    const resolved = preferSavedProvider(provider, providers);
    setSelectedProviderId(resolved.id);
  }, [providers]);

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

  const bmwOnlyCount = useMemo(
    () => providers.filter((p) => p.fromBmwOnly).length,
    [providers],
  );

  const savedProviderCount = useMemo(
    () => providers.filter((p) => p.dbId && !p.fromBmwOnly).length,
    [providers],
  );

  const handleSaveAllBmwProviders = async () => {
    if (!bmwOnlyCount || savingBmwProviders) return;
    if (
      !window.confirm(
        `Save all ${bmwOnlyCount} BMW vendors to the database? This creates persisted provider profiles (with solutions from BMW deals) so you can add guides and edit details.`,
      )
    ) {
      return;
    }
    setSavingBmwProviders(true);
    setBmwSaveMessage(null);
    setError(null);
    try {
      const { imported } = await saveAllBmwSolutionProviders();
      await refreshProviders();
      setBmwSaveMessage(`Saved ${imported} vendor${imported === 1 ? '' : 's'} to the database.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save BMW vendors');
    } finally {
      setSavingBmwProviders(false);
    }
  };

  if (loading) {
    return <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading partners…</p>;
  }

  if (selectedCommissionPartner && tab === 'commission') {
    return (
      <CommissionPartnerDetailPage
        row={selectedCommissionPartner}
        partners={partners}
        onBack={() => setSelectedCommissionPartnerKey(null)}
        onUpdated={() => void refreshPartners()}
      />
    );
  }

  if (selectedProvider && tab === 'suppliers') {
    return (
      <SupplierDetailPage
        provider={selectedProvider}
        partners={partners}
        onBack={() => setSelectedProviderId(null)}
        onUpdated={(next) => {
          void refreshProviders().then(() => setSelectedProviderId(next.id));
        }}
      />
    );
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--amber-light)', color: 'var(--amber)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {bmwSaveMessage && tab === 'suppliers' && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--green-light)', color: 'var(--green)', fontSize: 13 }}>
          {bmwSaveMessage}
        </div>
      )}

      <div className="comm-tabs">
        <button
          type="button"
          className={`comm-tab${tab === 'commission' ? ' active' : ''}`}
          onClick={() => { setTab('commission'); setSelectedProviderId(null); setSelectedCommissionPartnerKey(null); }}
        >
          Commission Partners
        </button>
        <button
          type="button"
          className={`comm-tab${tab === 'suppliers' ? ' active' : ''}`}
          onClick={() => { setTab('suppliers'); setExpandedPaySource(null); setSelectedCommissionPartnerKey(null); }}
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
            <div className="card-header" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="card-title">Commission partners</div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
                  Partners who pay Candid — pay sources from BMW deals, bank reports, and deposit matching (includes Candid)
                </div>
              </div>
              <ImportExportControls
                label="Import CSV/Excel to update bank match & contacts. Export includes all pay sources."
                onExportCsv={() => exportCommissionPartnersCsv(partners)}
                onExportXlsx={() => exportCommissionPartnersXlsx(partners)}
                onImport={async (file) => {
                  const result = await importCommissionPartnersFromFile(file, [...partners]);
                  await refreshPartners();
                  return {
                    message: `Imported ${result.imported} row${result.imported === 1 ? '' : 's'} (${result.created} created, ${result.updated} updated).`,
                  };
                }}
              />
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <CommissionPartnerTable
                rows={commissionRows}
                expandedPaySource={expandedPaySource}
                onToggle={setExpandedPaySource}
                onView={openCommissionPartnerDetail}
                onEdit={setEditPartner}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="comm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="comm-stat-card">
              <div className="comm-stat-label">Saved to database</div>
              <div className="comm-stat-value">{savedProviderCount}</div>
              <div className="comm-stat-sub">
                {bmwOnlyCount > 0 ? `${bmwOnlyCount} BMW-only (not saved yet)` : 'All vendors persisted'}
              </div>
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
            <div className="card-header" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="card-title">Suppliers & vendors</div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
                  Actual solution providers (Comcast, Dialpad, Vonage, etc.) — sold through commission partners like Telarus
                </div>
              </div>
              <ImportExportControls
                label="One row per solution/rate. Import updates or creates providers."
                onExportCsv={() => exportSolutionProvidersCsv(providers)}
                onExportXlsx={() => exportSolutionProvidersXlsx(providers)}
                onImport={async (file) => {
                  const result = await importSolutionProvidersFromFile(file, providers);
                  await refreshProviders();
                  return {
                    message: `Imported ${result.imported} provider${result.imported === 1 ? '' : 's'}.`,
                  };
                }}
              />
              <input
                type="search"
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                placeholder="Search providers…"
                style={{ border: '1px solid var(--gray-border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, width: 220 }}
              />
              {bmwOnlyCount > 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                  disabled={savingBmwProviders}
                  onClick={() => void handleSaveAllBmwProviders()}
                >
                  {savingBmwProviders ? 'Saving…' : `Save all BMW vendors (${bmwOnlyCount})`}
                </button>
              )}
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
                      <th>Type</th>
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
                          <td style={{ fontSize: 12, color: 'var(--gray)' }}>{providerCategoryLabel(p.providerCategory)}</td>
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
