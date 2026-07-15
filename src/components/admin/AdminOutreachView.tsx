'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  addOutreachAccounts,
  deleteOutreachAccount,
  listOutreachAccounts,
  OUTREACH_STATUS_LABELS,
  OUTREACH_STATUSES,
  patchOutreachAccount,
  type OutreachAccount,
  type OutreachOwnerOption,
  type OutreachStatus,
} from '@/lib/outreach';

type CustomerOption = { id: string; company: string };

type Props = {
  customers: CustomerOption[];
  onOpenCustomer: (customerId: string) => void;
};

function TriState({
  value,
  onChange,
  disabled,
}: {
  value: boolean | null;
  onChange: (next: boolean | null) => void;
  disabled?: boolean;
}) {
  const cycle = () => {
    if (disabled) return;
    if (value === null) onChange(true);
    else if (value === true) onChange(false);
    else onChange(null);
  };
  const label = value === null ? '?' : value ? 'Yes' : 'No';
  return (
    <button
      type="button"
      className="admin-ticket-btn"
      style={{ minWidth: 44, fontSize: 12, padding: '4px 8px' }}
      onClick={cycle}
      disabled={disabled}
      title="Click to cycle: unknown → yes → no"
    >
      {label}
    </button>
  );
}

export function AdminOutreachView({ customers, onOpenCustomer }: Props) {
  const [ownerFilter, setOwnerFilter] = useState<'me' | 'all' | string>('me');
  const [items, setItems] = useState<OutreachAccount[]>([]);
  const [owners, setOwners] = useState<OutreachOwnerOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listOutreachAccounts(ownerFilter);
      setItems(data.items);
      setOwners(data.owners);
      setCurrentUserId(data.currentUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load outreach');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [ownerFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onListIds = useMemo(() => new Set(items.map((i) => i.customerExternalId)), [items]);
  const availableCustomers = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return customers
      .filter((c) => !onListIds.has(c.id))
      .filter((c) => !q || c.company.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .slice(0, 80);
  }, [customers, onListIds, pickerQuery]);

  const viewingOwn =
    ownerFilter === 'me' || (currentUserId != null && ownerFilter === currentUserId);

  const updateItem = async (
    id: string,
    patch: Parameters<typeof patchOutreachAccount>[1],
  ) => {
    try {
      const next = await patchOutreachAccount(id, patch);
      setItems((prev) => prev.map((row) => (row.id === id ? next : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleAdd = async () => {
    if (!selectedIds.size) return;
    setSaving(true);
    setError('');
    try {
      await addOutreachAccounts([...selectedIds]);
      setSelectedIds(new Set());
      setPickerOpen(false);
      setPickerQuery('');
      setOwnerFilter('me');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add accounts');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="outreach-view">
      <div className="outreach-toolbar">
        <div className="outreach-toolbar-left">
          <h2 className="outreach-title">Outreach</h2>
          <p className="outreach-sub">
            Personal working lists of accounts to contact. Teammates can view each other’s lists.
          </p>
        </div>
        <div className="outreach-toolbar-right">
          <label className="outreach-filter">
            <span>Show</span>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
            >
              <option value="me">My list</option>
              <option value="all">Everyone</option>
              {owners
                .filter((o) => o.id !== currentUserId)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayName}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setPickerOpen(true)}
          >
            <AppIcon name="add" size={12} /> Add accounts
          </button>
        </div>
      </div>

      {error ? <div className="outreach-error">{error}</div> : null}

      {loading ? (
        <div className="outreach-empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="outreach-empty">
          <strong>No accounts on this list yet.</strong>
          <span>Add accounts from CRM to track who knows Candid and how you can help.</span>
          <button type="button" className="btn btn-primary" onClick={() => setPickerOpen(true)}>
            Add accounts
          </button>
        </div>
      ) : (
        <div className="outreach-table-wrap">
          <table className="outreach-table">
            <thead>
              <tr>
                <th>Account</th>
                {ownerFilter === 'all' ? <th>Owner</th> : null}
                <th>Status</th>
                <th>Knows Candid?</th>
                <th>Knows what we do?</th>
                <th>How else can we help?</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const canEdit = viewingOwn && row.ownerUserId === currentUserId;
                return (
                  <tr key={row.id}>
                    <td>
                      <button
                        type="button"
                        className="outreach-account-link"
                        onClick={() => onOpenCustomer(row.customerExternalId)}
                      >
                        {row.company}
                      </button>
                    </td>
                    {ownerFilter === 'all' ? (
                      <td className="outreach-muted">{row.ownerDisplayName ?? '—'}</td>
                    ) : null}
                    <td>
                      <select
                        className="outreach-select"
                        value={row.status}
                        disabled={!canEdit}
                        onChange={(e) =>
                          void updateItem(row.id, { status: e.target.value as OutreachStatus })
                        }
                      >
                        {OUTREACH_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {OUTREACH_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <TriState
                        value={row.knowsCandid}
                        disabled={!canEdit}
                        onChange={(knowsCandid) => void updateItem(row.id, { knowsCandid })}
                      />
                    </td>
                    <td>
                      <TriState
                        value={row.knowsWhatWeDo}
                        disabled={!canEdit}
                        onChange={(knowsWhatWeDo) => void updateItem(row.id, { knowsWhatWeDo })}
                      />
                    </td>
                    <td>
                      <input
                        className="outreach-input"
                        value={row.howElseHelp}
                        disabled={!canEdit}
                        placeholder="Optional"
                        onChange={(e) => {
                          const howElseHelp = e.target.value;
                          setItems((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, howElseHelp } : r)),
                          );
                        }}
                        onBlur={(e) => void updateItem(row.id, { howElseHelp: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="outreach-input"
                        value={row.notes}
                        disabled={!canEdit}
                        placeholder="Notes"
                        onChange={(e) => {
                          const notes = e.target.value;
                          setItems((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, notes } : r)),
                          );
                        }}
                        onBlur={(e) => void updateItem(row.id, { notes: e.target.value })}
                      />
                    </td>
                    <td>
                      {canEdit ? (
                        <button
                          type="button"
                          className="admin-ticket-btn"
                          title="Remove from list"
                          onClick={() =>
                            void deleteOutreachAccount(row.id).then(reload).catch((err) => {
                              setError(err instanceof Error ? err.message : 'Remove failed');
                            })
                          }
                        >
                          <AppIcon name="close" size={11} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pickerOpen ? (
        <div className="outreach-modal-backdrop" onClick={() => !saving && setPickerOpen(false)}>
          <div
            className="outreach-modal"
            role="dialog"
            aria-label="Add outreach accounts"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="outreach-modal-head">
              <strong>Add accounts</strong>
              <button type="button" className="admin-ticket-btn" onClick={() => setPickerOpen(false)}>
                <AppIcon name="close" size={12} />
              </button>
            </div>
            <input
              className="outreach-input"
              placeholder="Search accounts…"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              autoFocus
            />
            <div className="outreach-picker-list">
              {availableCustomers.length === 0 ? (
                <div className="outreach-muted" style={{ padding: 12 }}>
                  No matching accounts available to add.
                </div>
              ) : (
                availableCustomers.map((c) => {
                  const checked = selectedIds.has(c.id);
                  return (
                    <label key={c.id} className="outreach-picker-row">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          });
                        }}
                      />
                      <span>{c.company}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="outreach-modal-actions">
              <button type="button" className="admin-ticket-btn" onClick={() => setPickerOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selectedIds.size || saving}
                onClick={() => void handleAdd()}
              >
                {saving ? 'Adding…' : `Add ${selectedIds.size || ''}`.trim()}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
