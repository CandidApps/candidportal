'use client';

import { useMemo, useState } from 'react';
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

type StatusFilter = 'all' | AdminTicketStatus;
type KindFilter = 'all' | AdminTicketKind;

type AdminTicketsViewProps = {
  tickets: UnifiedAdminTicket[];
  customerTickets?: CustomerTicketRow[];
  analysisTickets?: AnalysisTicketRow[];
  onResolveServiceTicket?: (ticketId: string) => void;
  onResolveAnalysisTicket?: (ticketId: string) => void;
  onDismissStatementReview?: (sourceId: string) => void;
  onSetServiceInProgress?: (ticketId: string) => void;
  portalCustomers?: { company: string; portal?: CustomerPortalData }[];
};

export function AdminTicketsView({
  tickets,
  customerTickets = [],
  analysisTickets = [],
  onResolveServiceTicket,
  onResolveAnalysisTicket,
  onDismissStatementReview,
  onSetServiceInProgress,
  portalCustomers = [],
}: AdminTicketsViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.detail.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.customerEmail.toLowerCase().includes(q)
      );
    });
  }, [tickets, statusFilter, kindFilter, search]);

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
      <div className="greeting">
        <h2>Action Center</h2>
        <p>Click any row to open details, uploaded statements, and Hank&apos;s recommended actions.</p>
      </div>

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
        <select
          className="admin-tickets-select"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as KindFilter)}
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          <option value="statement">Statement review</option>
          <option value="renewal">Contract renewal</option>
          <option value="optimization">Savings opportunity</option>
          <option value="service">Service ticket</option>
          <option value="analysis">Analysis</option>
        </select>
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
                <th>Type</th>
                <th>Status</th>
                <th>Customer</th>
                <th>Subject</th>
                <th>Updated</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--gray)' }}>
                    No actions match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr
                    key={t.id}
                    className={`admin-tickets-row${selectedId === t.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(t.id)}
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
                    <td className="admin-ticket-time">{t.timeLabel}</td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="admin-ticket-btn primary"
                        onClick={() => setSelectedId(t.id)}
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
