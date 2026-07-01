'use client';

import { useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { Contact, Customer } from '@/components/CustomersView';
import {
  filterPortalPreviewEntries,
  listAdminPortalPreviewEntries,
} from '@/lib/admin-portal-preview';

type Props = {
  customers: Customer[];
  onOpenCustomerView: (contact: Contact, customer: Customer) => void;
};

export function AdminPortalPreviewPanel({ customers, onOpenCustomerView }: Props) {
  const entries = useMemo(() => listAdminPortalPreviewEntries(customers), [customers]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const filtered = useMemo(
    () => filterPortalPreviewEntries(entries, search),
    [entries, search],
  );

  const selectedEntry = useMemo(() => {
    if (selectedId && filtered.some((e) => e.customerId === selectedId)) {
      return filtered.find((e) => e.customerId === selectedId) ?? null;
    }
    return filtered[0] ?? null;
  }, [filtered, selectedId]);

  const openPreview = () => {
    if (!selectedEntry) return;
    const customer = customers.find((c) => c.id === selectedEntry.customerId);
    if (!customer) return;
    onOpenCustomerView(selectedEntry.contact, customer);
  };

  if (!entries.length) {
    return (
      <div className="admin-portal-preview">
        <div className="admin-portal-preview-head">
          <AppIcon name="eye" size={18} className="admin-portal-preview-icon" />
          <div>
            <div className="admin-portal-preview-title">Customer view</div>
            <p className="admin-portal-preview-lead">
              No paying or portal-enabled accounts yet. Enable portal access on a contact or mark the
              account as active recurring to preview the member portal here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-portal-preview">
      <div className="admin-portal-preview-head">
        <AppIcon name="eye" size={18} className="admin-portal-preview-icon" />
        <div>
          <div className="admin-portal-preview-title">Open customer view</div>
          <p className="admin-portal-preview-lead">
            Preview the member portal as a paying or portal-subscribed client — no password required.
          </p>
        </div>
      </div>

      <div className="admin-portal-preview-controls">
        <label className="admin-portal-preview-field">
          <span className="admin-portal-preview-label">Search by account name</span>
          <div className="admin-portal-preview-search-wrap">
            <AppIcon name="search" size={14} className="admin-portal-preview-search-icon" />
            <input
              type="search"
              className="admin-portal-preview-input"
              placeholder="Type a customer name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedId('');
              }}
            />
          </div>
        </label>

        <label className="admin-portal-preview-field">
          <span className="admin-portal-preview-label">Account</span>
          <select
            className="admin-portal-preview-select"
            value={selectedEntry?.customerId ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {filtered.length === 0 ? (
              <option value="">No matches</option>
            ) : (
              filtered.map((entry) => (
                <option key={entry.customerId} value={entry.customerId}>
                  {entry.company} — {entry.subtitle}
                </option>
              ))
            )}
          </select>
        </label>

        <button
          type="button"
          className="admin-portal-preview-go"
          disabled={!selectedEntry}
          onClick={openPreview}
        >
          <AppIcon name="panelExpand" size={14} />
          Open customer view
        </button>
      </div>

      {search.trim() && filtered.length === 0 ? (
        <p className="admin-portal-preview-hint">No accounts match &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <p className="admin-portal-preview-hint">
          {entries.length} account{entries.length === 1 ? '' : 's'} available
          {search.trim() ? ` · ${filtered.length} match search` : ''}.
        </p>
      )}
    </div>
  );
}
