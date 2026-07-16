'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';
import {
  addOutreachAccounts,
  createOutreachFollowUp,
  DEFAULT_OUTREACH_VISIBLE_COLUMNS,
  deleteOutreachAccount,
  listOutreachAccounts,
  logOutreachContactActivity,
  OUTREACH_ASSIGN_LABELS,
  OUTREACH_ASSIGN_PRESETS,
  OUTREACH_COLUMN_IDS,
  OUTREACH_COLUMN_LABELS,
  OUTREACH_HELP_LABELS,
  OUTREACH_HELP_OPTIONS,
  OUTREACH_STATUS_LABELS,
  OUTREACH_STATUSES,
  patchOutreachAccount,
  saveOutreachColumnPrefs,
  type OutreachAccount,
  type OutreachAssignPreset,
  type OutreachColumnId,
  type OutreachColumnPrefs,
  type OutreachHelpOption,
  type OutreachOwnerOption,
  type OutreachPatch,
  type OutreachStatus,
} from '@/lib/outreach';
import { fetchTeamNotes, type TeamNoteRecord } from '@/lib/team-notes';

type CustomerOption = { id: string; company: string };

type Props = {
  customers: CustomerOption[];
  onOpenCustomer: (customerId: string) => void;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type QuickFilter = 'all' | 'overdue' | 'due_today' | 'no_follow_up' | 'opportunities' | 'not_contacted';
type SortKey = 'account' | 'daysSince' | 'nextFollowUp' | 'status';
type BulkKind = 'assign' | 'status' | 'followUp' | 'remove' | null;
type FollowUpKind = 'action' | 'lead' | null;

function phoneDigits(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysSinceLastContact(lastContactedAt: string | null): number | null {
  if (!lastContactedAt) return null;
  const then = new Date(`${lastContactedAt}T12:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  return Math.max(0, Math.round((startToday.getTime() - startThen.getTime()) / 86400000));
}

function formatDays(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

const QUICK_FILTERS: Array<{ key: QuickFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_today', label: 'Due Today' },
  { key: 'no_follow_up', label: 'No Follow-Up' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'not_contacted', label: 'Not Contacted' },
];

const SUMMARY_COLUMNS: OutreachColumnId[] = [
  'account',
  'contact',
  'owner',
  'status',
  'daysSince',
  'nextFollowUp',
  'followUpOwner',
  'actions',
];

export function AdminOutreachView({ customers, onOpenCustomer }: Props) {
  const [ownerFilter, setOwnerFilter] = useState<'me' | 'all' | string>('me');
  const [statusFilter, setStatusFilter] = useState<'all' | OutreachStatus>('all');
  const [helpFilter, setHelpFilter] = useState<'all' | OutreachHelpOption>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [items, setItems] = useState<OutreachAccount[]>([]);
  const [owners, setOwners] = useState<OutreachOwnerOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [columnPrefs, setColumnPrefs] = useState<OutreachColumnPrefs>({
    visibleColumns: DEFAULT_OUTREACH_VISIBLE_COLUMNS,
    columnOrder: [...OUTREACH_COLUMN_IDS],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [logOpenFor, setLogOpenFor] = useState<{ id: string; channel: 'call' | 'email' } | null>(
    null,
  );
  const [logNote, setLogNote] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const [addSelectedIds, setAddSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('daysSince');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [bulkKind, setBulkKind] = useState<BulkKind>(null);
  const [bulkStatus, setBulkStatus] = useState<OutreachStatus>('follow_up_needed');
  const [bulkFollowUp, setBulkFollowUp] = useState(todayIso());
  const [bulkAssignPreset, setBulkAssignPreset] = useState<OutreachAssignPreset>('me');
  const [bulkOtherUserId, setBulkOtherUserId] = useState('');
  const [followUpKind, setFollowUpKind] = useState<FollowUpKind>(null);
  const [followUpAssign, setFollowUpAssign] = useState<OutreachAssignPreset>('me');
  const [followUpOther, setFollowUpOther] = useState('');
  const [history, setHistory] = useState<TeamNoteRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listOutreachAccounts(ownerFilter);
      setItems(data.items);
      setOwners(data.owners);
      setCurrentUserId(data.currentUserId);
      setColumnPrefs(data.columnPrefs);
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

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

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

  const filteredItems = useMemo(() => {
    const today = todayIso();
    let rows = items.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (helpFilter !== 'all' && row.howCanWeHelp !== helpFilter) return false;
      if (quickFilter === 'overdue') {
        if (!row.nextFollowUpAt || row.nextFollowUpAt >= today) return false;
      } else if (quickFilter === 'due_today') {
        if (row.nextFollowUpAt !== today) return false;
      } else if (quickFilter === 'no_follow_up') {
        if (row.nextFollowUpAt) return false;
      } else if (quickFilter === 'opportunities') {
        if (row.status !== 'opportunity_identified') return false;
      } else if (quickFilter === 'not_contacted') {
        if (row.status !== 'not_started') return false;
      }
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (sortKey === 'account') return a.company.localeCompare(b.company) * dir;
      if (sortKey === 'status') return a.status.localeCompare(b.status) * dir;
      if (sortKey === 'nextFollowUp') {
        const av = a.nextFollowUpAt ?? '';
        const bv = b.nextFollowUpAt ?? '';
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        return av.localeCompare(bv) * dir;
      }
      const ad = daysSinceLastContact(a.lastContactedAt);
      const bd = daysSinceLastContact(b.lastContactedAt);
      const an = ad == null ? -1 : ad;
      const bn = bd == null ? -1 : bd;
      return (an - bn) * dir;
    });
    return rows;
  }, [items, statusFilter, helpFilter, quickFilter, sortKey, sortDir]);

  const selected = useMemo(
    () => items.find((r) => r.id === selectedId) ?? null,
    [items, selectedId],
  );

  const visibleColumns = useMemo(() => {
    const order = columnPrefs.columnOrder.length
      ? columnPrefs.columnOrder
      : [...OUTREACH_COLUMN_IDS];
    const preferred = order.filter((id) => SUMMARY_COLUMNS.includes(id));
    const visible = new Set(columnPrefs.visibleColumns);
    return preferred.filter((id) => {
      if (id === 'assignTo') return false;
      if (id === 'account' || id === 'actions') return true;
      if (id === 'owner') return ownerFilter === 'all' && visible.has(id);
      return visible.has(id);
    });
  }, [columnPrefs, ownerFilter]);

  const flashSave = (state: SaveState) => {
    setSaveState(state);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (state === 'saved' || state === 'error') {
      saveTimer.current = setTimeout(() => setSaveState('idle'), 2200);
    }
  };

  const updateItem = async (id: string, patch: OutreachPatch) => {
    flashSave('saving');
    try {
      const next = await patchOutreachAccount(id, patch);
      setItems((prev) => prev.map((row) => (row.id === id ? next : row)));
      flashSave('saved');
      return next;
    } catch (err) {
      flashSave('error');
      setError(err instanceof Error ? err.message : 'Update failed');
      throw err;
    }
  };

  const patchIfChanged = (
    row: OutreachAccount,
    key: keyof OutreachAccount,
    value: string | null,
    patch: OutreachPatch,
  ) => {
    const current = row[key];
    const normalizedCurrent = current == null || current === '' ? null : String(current);
    const normalizedNext = value == null || value === '' ? null : String(value);
    if (normalizedCurrent === normalizedNext) return;
    void updateItem(row.id, patch);
  };

  useEffect(() => {
    if (!selected) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    void fetchTeamNotes('customer', selected.customerExternalId)
      .then((notes) => {
        if (cancelled) return;
        const outreachNotes = notes
          .filter((n) => /outreach/i.test(n.body))
          .slice()
          .reverse();
        setHistory(outreachNotes.slice(0, 20));
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.customerExternalId, selected?.updatedAt]);

  const handleAdd = async () => {
    if (!addSelectedIds.size) return;
    setAdding(true);
    setError('');
    try {
      await addOutreachAccounts([...addSelectedIds]);
      setAddSelectedIds(new Set());
      setPickerOpen(false);
      setPickerQuery('');
      setOwnerFilter('me');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add accounts');
    } finally {
      setAdding(false);
    }
  };

  const saveColumns = async (next: OutreachColumnPrefs) => {
    setColumnPrefs(next);
    try {
      const saved = await saveOutreachColumnPrefs(next);
      setColumnPrefs(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save columns');
    }
  };

  const callContact = (row: OutreachAccount) => {
    const phone = row.contact?.phone?.trim();
    if (!phone) {
      setError('No phone on the selected contact.');
      return;
    }
    window.location.href = `tel:${phoneDigits(phone)}`;
    setLogOpenFor({ id: row.id, channel: 'call' });
    setLogNote('');
  };

  const emailContact = (row: OutreachAccount) => {
    const email = row.contact?.email?.trim();
    if (!email) {
      setError('No email on the selected contact.');
      return;
    }
    launchAdminZohoCompose({
      to: email,
      subject: `Candid — following up with ${row.company}`,
      body: `Hi ${row.contact?.name?.split(' ')[0] || 'there'},\n\n`,
      contextLabel: `Outreach · ${row.company}`,
    });
    setLogOpenFor({ id: row.id, channel: 'email' });
    setLogNote('');
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'account' ? 'asc' : 'desc');
    }
  };

  const editableIds = useMemo(() => {
    if (!viewingOwn || !currentUserId) return new Set<string>();
    return new Set(
      filteredItems.filter((r) => r.ownerUserId === currentUserId).map((r) => r.id),
    );
  }, [filteredItems, viewingOwn, currentUserId]);

  const toggleBulk = (id: string) => {
    if (!editableIds.has(id)) return;
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBulkAll = () => {
    const ids = [...editableIds].filter((id) => filteredItems.some((r) => r.id === id));
    setBulkSelected((prev) => {
      if (ids.every((id) => prev.has(id))) return new Set();
      return new Set(ids);
    });
  };

  const runBulk = async () => {
    const ids = [...bulkSelected].filter((id) => editableIds.has(id));
    if (!ids.length || !bulkKind) return;
    flashSave('saving');
    try {
      if (bulkKind === 'remove') {
        for (const id of ids) await deleteOutreachAccount(id);
        setSelectedId((cur) => (cur && ids.includes(cur) ? null : cur));
      } else if (bulkKind === 'status') {
        for (const id of ids) {
          await patchOutreachAccount(id, { status: bulkStatus, logActivity: true });
        }
      } else if (bulkKind === 'followUp') {
        for (const id of ids) {
          await patchOutreachAccount(id, {
            nextFollowUpAt: bulkFollowUp || null,
            logActivity: true,
          });
        }
      } else if (bulkKind === 'assign') {
        for (const id of ids) {
          await patchOutreachAccount(id, {
            assignPreset: bulkAssignPreset,
            otherUserId: bulkOtherUserId || undefined,
            followUpOwnerUserId:
              bulkAssignPreset === 'other'
                ? bulkOtherUserId || null
                : bulkAssignPreset === 'me'
                  ? currentUserId
                  : undefined,
            logActivity: true,
          });
        }
      }
      setBulkSelected(new Set());
      setBulkKind(null);
      await reload();
      flashSave('saved');
    } catch (err) {
      flashSave('error');
      setError(err instanceof Error ? err.message : 'Bulk update failed');
    }
  };

  const openFollowUp = (kind: 'action' | 'lead', rowId: string) => {
    setSelectedId(rowId);
    setFollowUpKind(kind);
    setFollowUpAssign('me');
    setFollowUpOther('');
    setMenuFor(null);
  };

  const confirmFollowUp = async () => {
    if (!selected || !followUpKind) return;
    flashSave('saving');
    try {
      await patchOutreachAccount(selected.id, {
        assignPreset: followUpAssign,
        otherUserId: followUpOther || undefined,
        logActivity: false,
      });
      const res = await createOutreachFollowUp(selected.id, followUpKind);
      setItems((prev) => prev.map((r) => (r.id === selected.id ? res.item : r)));
      setFollowUpKind(null);
      flashSave('saved');
    } catch (err) {
      flashSave('error');
      setError(err instanceof Error ? err.message : 'Follow-up failed');
    }
  };

  const canEditSelected =
    Boolean(selected) && viewingOwn && selected?.ownerUserId === currentUserId;

  return (
    <div className="outreach-view">
      <div className="outreach-toolbar">
        <div className="outreach-toolbar-left">
          <h2 className="outreach-title">Outreach</h2>
          <p className="outreach-sub">
            Compact working list — open a row for full details, history, and follow-ups.
          </p>
        </div>
        <div className="outreach-toolbar-right">
          <span
            className={`outreach-save-state is-${saveState}`}
            aria-live="polite"
          >
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                  ? 'Error saving'
                  : null}
          </span>
          <button type="button" className="admin-ticket-btn" onClick={() => setColumnsOpen(true)}>
            Columns
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setPickerOpen(true)}>
            <AppIcon name="add" size={12} /> Add accounts
          </button>
        </div>
      </div>

      <div className="outreach-quick-filters">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`outreach-chip${quickFilter === f.key ? ' active' : ''}`}
            onClick={() => setQuickFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="outreach-filters">
        <label className="outreach-filter">
          <span>List</span>
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
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
        <label className="outreach-filter">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | OutreachStatus)}
          >
            <option value="all">All</option>
            {OUTREACH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {OUTREACH_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="outreach-filter">
          <span>How can we help</span>
          <select
            value={helpFilter}
            onChange={(e) => setHelpFilter(e.target.value as 'all' | OutreachHelpOption)}
          >
            <option value="all">All</option>
            {OUTREACH_HELP_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {OUTREACH_HELP_LABELS[opt]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {bulkSelected.size > 0 ? (
        <div className="outreach-bulk-bar">
          <span>{bulkSelected.size} selected</span>
          <button type="button" className="admin-ticket-btn" onClick={() => setBulkKind('assign')}>
            Assign user
          </button>
          <button type="button" className="admin-ticket-btn" onClick={() => setBulkKind('status')}>
            Change status
          </button>
          <button type="button" className="admin-ticket-btn" onClick={() => setBulkKind('followUp')}>
            Set follow-up
          </button>
          <button type="button" className="admin-ticket-btn" onClick={() => setBulkKind('remove')}>
            Remove
          </button>
          <button
            type="button"
            className="admin-ticket-btn"
            onClick={() => setBulkSelected(new Set())}
          >
            Clear
          </button>
        </div>
      ) : null}

      {error ? <div className="outreach-error">{error}</div> : null}

      <div className={`outreach-workspace${selected ? ' has-panel' : ''}`}>
        <div className="outreach-main">
          {loading ? (
            <div className="outreach-empty">Loading…</div>
          ) : filteredItems.length === 0 ? (
            <div className="outreach-empty">
              <strong>No accounts match these filters.</strong>
              <span>Add accounts from CRM or clear filters to see your outreach list.</span>
              <button type="button" className="btn btn-primary" onClick={() => setPickerOpen(true)}>
                Add accounts
              </button>
            </div>
          ) : (
            <div className={`outreach-table-wrap${viewingOwn ? ' has-bulk-select' : ''}`}>
              <table className="outreach-table outreach-table--summary">
                <thead>
                  <tr>
                    {viewingOwn ? (
                      <th className="outreach-check-col">
                        <input
                          type="checkbox"
                          aria-label="Select all editable"
                          checked={
                            editableIds.size > 0 &&
                            [...editableIds].every((id) => bulkSelected.has(id))
                          }
                          onChange={toggleBulkAll}
                        />
                      </th>
                    ) : null}
                    {visibleColumns.map((col) => {
                      const sortMap: Partial<Record<OutreachColumnId, SortKey>> = {
                        account: 'account',
                        daysSince: 'daysSince',
                        nextFollowUp: 'nextFollowUp',
                        status: 'status',
                      };
                      const mapped = sortMap[col];
                      const sticky =
                        col === 'account'
                          ? 'outreach-sticky outreach-sticky-1'
                          : col === 'contact'
                            ? 'outreach-sticky outreach-sticky-2'
                            : '';
                      return (
                        <th
                          key={col}
                          className={`${sticky}${mapped ? ' is-sortable' : ''}`}
                          onClick={mapped ? () => toggleSort(mapped) : undefined}
                        >
                          {col === 'followUpOwner' ? 'Outreach Owner' : OUTREACH_COLUMN_LABELS[col]}
                          {mapped && sortKey === mapped ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((row) => {
                    const canEdit = viewingOwn && row.ownerUserId === currentUserId;
                    const active = selectedId === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={`outreach-row${active ? ' is-active' : ''}`}
                        onClick={() => setSelectedId(row.id)}
                      >
                        {viewingOwn ? (
                          <td className="outreach-check-col" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              disabled={!canEdit}
                              checked={bulkSelected.has(row.id)}
                              onChange={() => toggleBulk(row.id)}
                              aria-label={`Select ${row.company}`}
                            />
                          </td>
                        ) : null}
                        {visibleColumns.map((col) => {
                          if (col === 'account') {
                            return (
                              <td key={col} className="outreach-sticky outreach-sticky-1">
                                <button
                                  type="button"
                                  className="outreach-account-link"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenCustomer(row.customerExternalId);
                                  }}
                                >
                                  {row.company}
                                </button>
                              </td>
                            );
                          }
                          if (col === 'contact') {
                            return (
                              <td key={col} className="outreach-sticky outreach-sticky-2">
                                <div className="outreach-contact-compact">
                                  <span>{row.contact?.name || '—'}</span>
                                  <span className="outreach-contact-actions" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      className="admin-ticket-btn"
                                      title={row.contact?.phone || 'No phone'}
                                      disabled={!row.contact?.phone}
                                      onClick={() => callContact(row)}
                                    >
                                      <AppIcon name="phone" size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      className="admin-ticket-btn"
                                      title={row.contact?.email || 'No email'}
                                      disabled={!row.contact?.email}
                                      onClick={() => emailContact(row)}
                                    >
                                      <AppIcon name="email" size={11} />
                                    </button>
                                  </span>
                                </div>
                              </td>
                            );
                          }
                          if (col === 'owner') {
                            return (
                              <td key={col} className="outreach-muted">
                                {row.ownerDisplayName ?? '—'}
                              </td>
                            );
                          }
                          if (col === 'status') {
                            return (
                              <td key={col} onClick={(e) => e.stopPropagation()}>
                                <select
                                  className="outreach-select"
                                  value={row.status}
                                  disabled={!canEdit}
                                  onChange={(e) =>
                                    void updateItem(row.id, {
                                      status: e.target.value as OutreachStatus,
                                      logActivity: true,
                                    })
                                  }
                                >
                                  {OUTREACH_STATUSES.map((status) => (
                                    <option key={status} value={status}>
                                      {OUTREACH_STATUS_LABELS[status]}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          }
                          if (col === 'daysSince') {
                            return (
                              <td key={col}>{formatDays(daysSinceLastContact(row.lastContactedAt))}</td>
                            );
                          }
                          if (col === 'nextFollowUp') {
                            return (
                              <td key={col} className="outreach-muted">
                                {row.nextFollowUpAt || '—'}
                              </td>
                            );
                          }
                          if (col === 'followUpOwner') {
                            return (
                              <td key={col} className="outreach-muted">
                                {row.followUpOwnerDisplayName ||
                                  row.assignedDisplayNames?.[0] ||
                                  row.ownerDisplayName ||
                                  '—'}
                              </td>
                            );
                          }
                          if (col === 'actions') {
                            return (
                              <td key={col} onClick={(e) => e.stopPropagation()}>
                                <div className="outreach-menu-wrap" ref={menuFor === row.id ? menuRef : undefined}>
                                  <button
                                    type="button"
                                    className="admin-ticket-btn"
                                    title="More actions"
                                    aria-label="More actions"
                                    onClick={() =>
                                      setMenuFor((cur) => (cur === row.id ? null : row.id))
                                    }
                                  >
                                    ⋯
                                  </button>
                                  {menuFor === row.id ? (
                                    <div className="outreach-menu">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedId(row.id);
                                          setMenuFor(null);
                                        }}
                                      >
                                        Open details
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onOpenCustomer(row.customerExternalId);
                                          setMenuFor(null);
                                        }}
                                      >
                                        Open account
                                      </button>
                                      {canEdit ? (
                                        <>
                                          <button
                                            type="button"
                                            disabled={Boolean(row.linkedReminderId)}
                                            onClick={() => openFollowUp('action', row.id)}
                                          >
                                            {row.linkedReminderId ? 'Action linked' : 'Create action'}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={Boolean(row.linkedLeadId)}
                                            onClick={() => openFollowUp('lead', row.id)}
                                          >
                                            {row.linkedLeadId ? 'Lead linked' : 'Create lead'}
                                          </button>
                                          <button
                                            type="button"
                                            className="is-danger"
                                            onClick={() =>
                                              void deleteOutreachAccount(row.id)
                                                .then(() => {
                                                  if (selectedId === row.id) setSelectedId(null);
                                                  return reload();
                                                })
                                                .catch((err) =>
                                                  setError(
                                                    err instanceof Error ? err.message : 'Remove failed',
                                                  ),
                                                )
                                            }
                                          >
                                            Remove from list
                                          </button>
                                        </>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            );
                          }
                          return <td key={col}>—</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected ? (
          <aside className="outreach-side-panel" aria-label="Outreach details">
            <div className="outreach-side-head">
              <div>
                <h3>{selected.company}</h3>
                <p className="outreach-muted">
                  {OUTREACH_STATUS_LABELS[selected.status]}
                  {selected.nextFollowUpAt ? ` · Follow-up ${selected.nextFollowUpAt}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="admin-ticket-btn"
                aria-label="Close details"
                onClick={() => setSelectedId(null)}
              >
                <AppIcon name="close" size={12} />
              </button>
            </div>

            <div className="outreach-side-body">
              <section className="outreach-side-section">
                <h4>Contact</h4>
                <label className="outreach-field">
                  <span>Linked contact</span>
                  <select
                    className="outreach-select"
                    value={selected.contactId ?? ''}
                    disabled={!canEditSelected || selected.contacts.length === 0}
                    onChange={(e) =>
                      void updateItem(selected.id, {
                        contactId: e.target.value || null,
                        logActivity: true,
                      })
                    }
                  >
                    {selected.contacts.length === 0 ? <option value="">No contacts</option> : null}
                    {selected.contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.isPrimary ? ' (primary)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="outreach-contact-actions">
                  <button
                    type="button"
                    className="admin-ticket-btn"
                    disabled={!selected.contact?.phone}
                    onClick={() => callContact(selected)}
                  >
                    <AppIcon name="phone" size={11} /> Call
                  </button>
                  <button
                    type="button"
                    className="admin-ticket-btn"
                    disabled={!selected.contact?.email}
                    onClick={() => emailContact(selected)}
                  >
                    <AppIcon name="email" size={11} /> Email
                  </button>
                  <button
                    type="button"
                    className="admin-ticket-btn"
                    onClick={() => onOpenCustomer(selected.customerExternalId)}
                  >
                    Open account
                  </button>
                </div>
              </section>

              <section className="outreach-side-section">
                <h4>Follow-up details</h4>
                <label className="outreach-field">
                  <span>Status</span>
                  <select
                    className="outreach-select"
                    value={selected.status}
                    disabled={!canEditSelected}
                    onChange={(e) =>
                      void updateItem(selected.id, {
                        status: e.target.value as OutreachStatus,
                        logActivity: true,
                      })
                    }
                  >
                    {OUTREACH_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {OUTREACH_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="outreach-field">
                  <span>Last contacted</span>
                  <input
                    type="date"
                    className="outreach-input"
                    value={selected.lastContactedAt ?? ''}
                    disabled={!canEditSelected}
                    onChange={(e) => {
                      const lastContactedAt = e.target.value || null;
                      setItems((prev) =>
                        prev.map((r) =>
                          r.id === selected.id ? { ...r, lastContactedAt } : r,
                        ),
                      );
                    }}
                    onBlur={(e) =>
                      patchIfChanged(selected, 'lastContactedAt', e.target.value || null, {
                        lastContactedAt: e.target.value || null,
                        logActivity: true,
                      })
                    }
                  />
                </label>
                <p className="outreach-muted">
                  Days since last contact: {formatDays(daysSinceLastContact(selected.lastContactedAt))}
                </p>
                <label className="outreach-field">
                  <span>Next follow-up</span>
                  <input
                    type="date"
                    className="outreach-input"
                    value={selected.nextFollowUpAt ?? ''}
                    disabled={!canEditSelected}
                    onChange={(e) => {
                      const nextFollowUpAt = e.target.value || null;
                      setItems((prev) =>
                        prev.map((r) =>
                          r.id === selected.id ? { ...r, nextFollowUpAt } : r,
                        ),
                      );
                    }}
                    onBlur={(e) =>
                      patchIfChanged(selected, 'nextFollowUpAt', e.target.value || null, {
                        nextFollowUpAt: e.target.value || null,
                        logActivity: true,
                      })
                    }
                  />
                </label>
                <label className="outreach-field">
                  <span>Outreach owner</span>
                  <select
                    className="outreach-select"
                    value={selected.followUpOwnerUserId ?? ''}
                    disabled={!canEditSelected}
                    onChange={(e) =>
                      void updateItem(selected.id, {
                        followUpOwnerUserId: e.target.value || null,
                        logActivity: true,
                      })
                    }
                  >
                    <option value="">—</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="outreach-hint">
                  Outreach Owner is who owns this outreach row. When you create an action or lead,
                  you&apos;ll choose who to assign that follow-up to.
                </p>
              </section>

              <section className="outreach-side-section">
                <h4>How can we help?</h4>
                <select
                  className="outreach-select"
                  value={selected.howCanWeHelp}
                  disabled={!canEditSelected}
                  onChange={(e) =>
                    void updateItem(selected.id, {
                      howCanWeHelp: e.target.value as OutreachHelpOption,
                      logActivity: true,
                    })
                  }
                >
                  {OUTREACH_HELP_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {OUTREACH_HELP_LABELS[opt]}
                    </option>
                  ))}
                </select>
              </section>

              <section className="outreach-side-section">
                <h4>Current provider</h4>
                <input
                  className="outreach-input"
                  value={selected.currentProvider}
                  disabled={!canEditSelected}
                  placeholder="Provider"
                  onChange={(e) => {
                    const currentProvider = e.target.value;
                    setItems((prev) =>
                      prev.map((r) => (r.id === selected.id ? { ...r, currentProvider } : r)),
                    );
                  }}
                  onBlur={(e) =>
                    patchIfChanged(selected, 'currentProvider', e.target.value, {
                      currentProvider: e.target.value,
                      logActivity: true,
                    })
                  }
                />
              </section>

              <section className="outreach-side-section">
                <h4>Customer pain points</h4>
                <textarea
                  className="outreach-input outreach-textarea"
                  rows={3}
                  value={selected.painPoints}
                  disabled={!canEditSelected}
                  placeholder="Pain points"
                  onChange={(e) => {
                    const painPoints = e.target.value;
                    setItems((prev) =>
                      prev.map((r) => (r.id === selected.id ? { ...r, painPoints } : r)),
                    );
                  }}
                  onBlur={(e) =>
                    patchIfChanged(selected, 'painPoints', e.target.value, {
                      painPoints: e.target.value,
                      logActivity: true,
                    })
                  }
                />
              </section>

              <section className="outreach-side-section">
                <h4>Notes</h4>
                <textarea
                  className="outreach-input outreach-textarea"
                  rows={4}
                  value={selected.notes}
                  disabled={!canEditSelected}
                  placeholder="Notes"
                  onChange={(e) => {
                    const notes = e.target.value;
                    setItems((prev) =>
                      prev.map((r) => (r.id === selected.id ? { ...r, notes } : r)),
                    );
                  }}
                  onBlur={(e) =>
                    patchIfChanged(selected, 'notes', e.target.value, {
                      notes: e.target.value,
                      logActivity: true,
                    })
                  }
                />
              </section>

              {canEditSelected ? (
                <section className="outreach-side-section">
                  <h4>Create follow-up</h4>
                  <div className="outreach-contact-actions">
                    <button
                      type="button"
                      className="admin-ticket-btn"
                      disabled={Boolean(selected.linkedReminderId)}
                      onClick={() => openFollowUp('action', selected.id)}
                    >
                      {selected.linkedReminderId ? 'Action linked' : 'Create action'}
                    </button>
                    <button
                      type="button"
                      className="admin-ticket-btn"
                      disabled={Boolean(selected.linkedLeadId)}
                      onClick={() => openFollowUp('lead', selected.id)}
                    >
                      {selected.linkedLeadId ? 'Lead linked' : 'Create lead'}
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="outreach-side-section">
                <h4>Recent outreach history</h4>
                {historyLoading ? (
                  <p className="outreach-muted">Loading…</p>
                ) : history.length === 0 ? (
                  <p className="outreach-muted">No outreach notes on this account yet.</p>
                ) : (
                  <ul className="outreach-history">
                    {history.map((n) => (
                      <li key={n.id}>
                        <div className="outreach-history-meta">
                          <strong>{n.authorName}</strong>
                          <span>{new Date(n.createdAt).toLocaleString()}</span>
                        </div>
                        <pre>{n.body}</pre>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </aside>
        ) : null}
      </div>

      {pickerOpen ? (
        <div className="outreach-modal-backdrop" onClick={() => !adding && setPickerOpen(false)}>
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
                  const checked = addSelectedIds.has(c.id);
                  return (
                    <label key={c.id} className="outreach-picker-row">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setAddSelectedIds((prev) => {
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
                disabled={!addSelectedIds.size || adding}
                onClick={() => void handleAdd()}
              >
                {adding ? 'Adding…' : `Add ${addSelectedIds.size || ''}`.trim()}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {columnsOpen ? (
        <div className="outreach-modal-backdrop" onClick={() => setColumnsOpen(false)}>
          <div
            className="outreach-modal"
            role="dialog"
            aria-label="Outreach columns"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="outreach-modal-head">
              <strong>Your summary columns</strong>
              <button type="button" className="admin-ticket-btn" onClick={() => setColumnsOpen(false)}>
                <AppIcon name="close" size={12} />
              </button>
            </div>
            <p className="outreach-muted" style={{ margin: '0 0 10px' }}>
              Choose which summary columns appear in your table. Longer fields stay in the side panel.
            </p>
            <div className="outreach-picker-list">
              {SUMMARY_COLUMNS.filter((c) => c !== 'assignTo').map((col) => {
                const locked = col === 'account' || col === 'actions';
                const checked = visibleColumns.includes(col) || locked;
                return (
                  <div key={col} className="outreach-picker-row outreach-column-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked || col === 'owner'}
                        onChange={() => {
                          const visible = new Set(columnPrefs.visibleColumns);
                          if (visible.has(col)) visible.delete(col);
                          else visible.add(col);
                          void saveColumns({
                            ...columnPrefs,
                            visibleColumns: [...visible] as OutreachColumnId[],
                          });
                        }}
                      />
                      <span>
                        {col === 'followUpOwner' ? 'Outreach Owner' : OUTREACH_COLUMN_LABELS[col]}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="outreach-modal-actions">
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={() =>
                  void saveColumns({
                    visibleColumns: DEFAULT_OUTREACH_VISIBLE_COLUMNS,
                    columnOrder: [...OUTREACH_COLUMN_IDS],
                  })
                }
              >
                Restore defaults
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setColumnsOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {logOpenFor ? (
        <div className="outreach-modal-backdrop" onClick={() => setLogOpenFor(null)}>
          <div
            className="outreach-modal"
            role="dialog"
            aria-label="Log outreach result"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="outreach-modal-head">
              <strong>Log {logOpenFor.channel === 'call' ? 'call' : 'email'} result</strong>
              <button type="button" className="admin-ticket-btn" onClick={() => setLogOpenFor(null)}>
                <AppIcon name="close" size={12} />
              </button>
            </div>
            <textarea
              className="outreach-input outreach-log-note"
              rows={4}
              placeholder="What happened? (saved to the account activity)"
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              autoFocus
            />
            <div className="outreach-modal-actions">
              <button type="button" className="admin-ticket-btn" onClick={() => setLogOpenFor(null)}>
                Skip
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  void logOutreachContactActivity(
                    logOpenFor.id,
                    logOpenFor.channel,
                    logNote,
                    items.find((r) => r.id === logOpenFor.id)?.status,
                  )
                    .then((next) => {
                      setItems((prev) => prev.map((r) => (r.id === next.id ? next : r)));
                      setLogOpenFor(null);
                      setLogNote('');
                      flashSave('saved');
                    })
                    .catch((err) => {
                      flashSave('error');
                      setError(err instanceof Error ? err.message : 'Could not log activity');
                    })
                }
              >
                Save to account
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkKind ? (
        <div className="outreach-modal-backdrop" onClick={() => setBulkKind(null)}>
          <div
            className="outreach-modal"
            role="dialog"
            aria-label="Bulk outreach actions"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="outreach-modal-head">
              <strong>
                {bulkKind === 'assign'
                  ? 'Assign user'
                  : bulkKind === 'status'
                    ? 'Change status'
                    : bulkKind === 'followUp'
                      ? 'Set follow-up date'
                      : 'Remove from list'}
              </strong>
              <button type="button" className="admin-ticket-btn" onClick={() => setBulkKind(null)}>
                <AppIcon name="close" size={12} />
              </button>
            </div>
            {bulkKind === 'status' ? (
              <select
                className="outreach-select"
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as OutreachStatus)}
              >
                {OUTREACH_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {OUTREACH_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            ) : null}
            {bulkKind === 'followUp' ? (
              <input
                type="date"
                className="outreach-input"
                value={bulkFollowUp}
                onChange={(e) => setBulkFollowUp(e.target.value)}
              />
            ) : null}
            {bulkKind === 'assign' ? (
              <>
                <select
                  className="outreach-select"
                  value={bulkAssignPreset}
                  onChange={(e) => setBulkAssignPreset(e.target.value as OutreachAssignPreset)}
                >
                  {OUTREACH_ASSIGN_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {OUTREACH_ASSIGN_LABELS[p]}
                    </option>
                  ))}
                </select>
                {bulkAssignPreset === 'other' ? (
                  <select
                    className="outreach-select"
                    value={bulkOtherUserId}
                    onChange={(e) => setBulkOtherUserId(e.target.value)}
                  >
                    <option value="">Pick user…</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.displayName}
                      </option>
                    ))}
                  </select>
                ) : null}
              </>
            ) : null}
            {bulkKind === 'remove' ? (
              <p className="outreach-muted">
                Remove {bulkSelected.size} account{bulkSelected.size === 1 ? '' : 's'} from your
                outreach list? This does not delete the CRM account.
              </p>
            ) : null}
            <div className="outreach-modal-actions">
              <button type="button" className="admin-ticket-btn" onClick={() => setBulkKind(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void runBulk()}>
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {followUpKind && selected ? (
        <div className="outreach-modal-backdrop" onClick={() => setFollowUpKind(null)}>
          <div
            className="outreach-modal"
            role="dialog"
            aria-label="Assign follow-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="outreach-modal-head">
              <strong>
                {followUpKind === 'action' ? 'Create action' : 'Create lead'} — assign to
              </strong>
              <button type="button" className="admin-ticket-btn" onClick={() => setFollowUpKind(null)}>
                <AppIcon name="close" size={12} />
              </button>
            </div>
            <p className="outreach-hint">
              Choose who should own the {followUpKind}. This is separate from the Outreach Owner on
              the row.
            </p>
            <select
              className="outreach-select"
              value={followUpAssign}
              onChange={(e) => setFollowUpAssign(e.target.value as OutreachAssignPreset)}
            >
              {OUTREACH_ASSIGN_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {OUTREACH_ASSIGN_LABELS[p]}
                </option>
              ))}
            </select>
            {followUpAssign === 'other' ? (
              <select
                className="outreach-select"
                value={followUpOther}
                onChange={(e) => setFollowUpOther(e.target.value)}
              >
                <option value="">Pick user…</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayName}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="outreach-modal-actions">
              <button type="button" className="admin-ticket-btn" onClick={() => setFollowUpKind(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={followUpAssign === 'other' && !followUpOther}
                onClick={() => void confirmFollowUp()}
              >
                Create {followUpKind}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
