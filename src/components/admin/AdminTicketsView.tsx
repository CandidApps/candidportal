'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  TICKET_KIND_LABEL,
  type AdminTicketKind,
  type AdminTicketStatus,
  type UnifiedAdminTicket,
} from '@/lib/admin-tickets';
import { getDemoStatementReview } from '@/lib/demo/admin-portfolio';
import type { CustomerTicketRow } from '@/lib/services/customer-tickets';
import type { AnalysisTicketRow } from '@/lib/services/analysis-tickets';
import type { CustomerPortalData } from '@/lib/portal-import/merge';
import { AdminTicketDetailPanel } from '@/components/admin/AdminTicketDetailPanel';
import { SortableTableHeader, toggleSortKey, type SortDirection } from '@/components/admin/SortableTableHeader';
import { formatReviewTime } from '@/lib/services/analysis-reviews';

import type { ActionCenterTab } from '@/components/admin/AdminActionCenterView';

type StatusFilter = 'all' | AdminTicketStatus;
type KindFilter = 'all' | AdminTicketKind;
type SortKey = 'kind' | 'status' | 'customer' | 'subject' | 'created';

const STATUS_SORT_ORDER: Record<AdminTicketStatus, number> = {
  open: 0,
  in_progress: 1,
  resolved: 2,
};

type AdminTicketsViewProps = {
  tickets: UnifiedAdminTicket[];
  customerTickets?: CustomerTicketRow[];
  analysisTickets?: AnalysisTicketRow[];
  onResolveServiceTicket?: (ticketId: string) => void;
  onResolveAnalysisTicket?: (ticketId: string) => void;
  onDismissStatementReview?: (sourceId: string) => void;
  onSetServiceInProgress?: (ticketId: string) => void;
  onOpenAnalysisReview?: (reviewId: string) => void;
  portalCustomers?: { company: string; portal?: CustomerPortalData }[];
  embedMode?: boolean;
  fixedKindFilter?: ActionCenterTab;
  initialSelectedTicketId?: string | null;
};

export function AdminTicketsView({
  tickets,
  customerTickets = [],
  analysisTickets = [],
  onResolveServiceTicket,
  onResolveAnalysisTicket,
  onDismissStatementReview,
  onSetServiceInProgress,
  onOpenAnalysisReview,
  portalCustomers = [],
  embedMode = false,
  fixedKindFilter,
  initialSelectedTicketId,
}: AdminTicketsViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  useEffect(() => {
    if (initialSelectedTicketId) {
      setSelectedId(initialSelectedTicketId);
    }
  }, [initialSelectedTicketId]);

  const effectiveKindFilter = fixedKindFilter ?? kindFilter;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (effectiveKindFilter !== 'all' && t.kind !== effectiveKindFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.detail.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.customerEmail.toLowerCase().includes(q)
      );
    });
  }, [tickets, statusFilter, effectiveKindFilter, search]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'kind':
          return dir * TICKET_KIND_LABEL[a.kind].localeCompare(TICKET_KIND_LABEL[b.kind]);
        case 'status':
          return (
            dir *
            ((STATUS_SORT_ORDER[a.status] ?? 0) - (STATUS_SORT_ORDER[b.status] ?? 0) ||
              a.status.localeCompare(b.status))
          );
        case 'customer': {
          const byName = a.customerName.localeCompare(b.customerName, undefined, { sensitivity: 'base' });
          if (byName !== 0) return dir * byName;
          return dir * a.customerEmail.localeCompare(b.customerEmail, undefined, { sensitivity: 'base' });
        }
        case 'subject':
          return (
            dir *
            (a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
              a.detail.localeCompare(b.detail, undefined, { sensitivity: 'base' }))
          );
        case 'created':
        default:
          return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    const next = toggleSortKey(sortKey, sortDir, key, key === 'created' ? 'desc' : 'asc');
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  const selected = selectedId ? tickets.find((t) => t.id === selectedId) : null;

  const serviceById = useMemo(
    () => new Map(customerTickets.map((t) => [t.id, t])),
    [customerTickets],
  );
  const analysisById = useMemo(
    () => new Map(analysisTickets.map((t) => [t.id, t])),
    [analysisTickets],
  );

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;

  const closeDetail = () => setSelectedId(null);

  const handleResolved = () => {
    closeDetail();
  };

  return (
    <div>
      {!embedMode && (
        <div className="greeting">
          <h2>Action Center</h2>
          <p>Click any row to open details, uploaded statements, and Hank&apos;s recommended actions.</p>
        </div>
      )}

      {notice && (
        <div className="comm-email-notice" style={{ marginBottom: 14 }}>
          {notice}
          <button
            type="button"
            className="admin-ticket-btn"
            style={{ marginLeft: 12 }}
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {!embedMode && (
        <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="kpi red">
            <div className="kpi-label">Open</div>
            <div className="kpi-value">{openCount}</div>
          </div>
          <div className="kpi amber">
            <div className="kpi-label">In progress</div>
            <div className="kpi-value">{inProgressCount}</div>
          </div>
          <div className="kpi blue">
            <div className="kpi-label">Total shown</div>
            <div className="kpi-value">{filtered.length}</div>
          </div>
        </div>
      )}

      <div className="admin-tickets-toolbar">
        <div className="admin-tickets-tabs">
          {(
            [
              ['all', 'All'],
              ['open', 'Open'],
              ['in_progress', 'In progress'],
              ['resolved', 'Resolved'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`admin-tickets-tab${statusFilter === id ? ' active' : ''}`}
              onClick={() => setStatusFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {!fixedKindFilter && (
          <select
            className="admin-tickets-select"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            <option value="analysis_review">Analysis review</option>
            <option value="statement">Statement review</option>
            <option value="renewal">Contract renewal</option>
            <option value="optimization">Savings opportunity</option>
            <option value="service">Service ticket</option>
            <option value="analysis">Analysis</option>
          </select>
        )}
        <input
          className="admin-tickets-search"
          type="search"
          placeholder="Search customer, subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-tickets-table">
            <thead>
              <tr>
                <SortableTableHeader
                  label="Type"
                  active={sortKey === 'kind'}
                  direction={sortDir}
                  onClick={() => onSort('kind')}
                />
                <SortableTableHeader
                  label="Status"
                  active={sortKey === 'status'}
                  direction={sortDir}
                  onClick={() => onSort('status')}
                />
                <SortableTableHeader
                  label="Customer"
                  active={sortKey === 'customer'}
                  direction={sortDir}
                  onClick={() => onSort('customer')}
                />
                <SortableTableHeader
                  label="Subject"
                  active={sortKey === 'subject'}
                  direction={sortDir}
                  onClick={() => onSort('subject')}
                />
                <SortableTableHeader
                  label="Created"
                  active={sortKey === 'created'}
                  direction={sortDir}
                  onClick={() => onSort('created')}
                />
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--gray)' }}>
                    No actions match your filters.
                  </td>
                </tr>
              ) : (
                sorted.map((t) => (
                  <tr
                    key={t.id}
                    className={`admin-tickets-row${selectedId === t.id ? ' selected' : ''}`}
                    onClick={() => {
                      if (t.kind === 'analysis_review' && onOpenAnalysisReview) {
                        onOpenAnalysisReview(t.sourceId);
                        return;
                      }
                      setSelectedId(t.id);
                    }}
                  >
                    <td>
                      <span className={`admin-ticket-pill admin-ticket-pill--${t.kind}`}>
                        {TICKET_KIND_LABEL[t.kind]}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-status-pill admin-status-pill--${t.status}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="admin-ticket-customer">{t.customerName}</div>
                      {t.customerEmail && (
                        <div className="admin-ticket-email">{t.customerEmail}</div>
                      )}
                    </td>
                    <td>
                      <div className="admin-ticket-subject">{t.title}</div>
                      <div className="admin-ticket-detail">{t.detail}</div>
                    </td>
                    <td className="admin-ticket-time">{formatReviewTime(t.createdAt)}</td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="admin-ticket-btn primary"
                        onClick={() => {
                          if (t.kind === 'analysis_review' && onOpenAnalysisReview) {
                            onOpenAnalysisReview(t.sourceId);
                            return;
                          }
                          setSelectedId(t.id);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <AdminTicketDetailPanel
          ticket={selected}
          serviceTicket={selected.kind === 'service' ? serviceById.get(selected.sourceId) : null}
          analysisTicket={selected.kind === 'analysis' ? analysisById.get(selected.sourceId) : null}
          statementReview={
            selected.kind === 'statement' ? getDemoStatementReview(selected.sourceId) : null
          }
          onClose={closeDetail}
          onNotify={(msg) => setNotice(msg)}
          onResolveServiceTicket={(id) => {
            onResolveServiceTicket?.(id);
            handleResolved();
          }}
          onResolveAnalysisTicket={(id) => {
            onResolveAnalysisTicket?.(id);
            handleResolved();
          }}
          onDismissStatementReview={(id) => {
            onDismissStatementReview?.(id);
            handleResolved();
          }}
          onSetServiceInProgress={(id) => {
            onSetServiceInProgress?.(id);
            setNotice('Action marked in progress.');
          }}
          portalCustomers={portalCustomers}
        />
      )}
    </div>
  );
}
