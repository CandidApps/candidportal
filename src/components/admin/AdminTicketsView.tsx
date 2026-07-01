'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TICKET_KIND_LABEL,
  formatAdminTicketCreated,
  ticketCreatedTimestamp,
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
import type { ActionCenterTab } from '@/components/admin/AdminActionCenterView';
import { isTicketMine } from '@/lib/admin-action-work';

type StatusFilter = 'all' | AdminTicketStatus;
type KindFilter = 'all' | AdminTicketKind;
type Scope = 'mine' | 'all';
type SortKey = 'kind' | 'status' | 'customer' | 'subject' | 'created' | 'modified';

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
  tab?: ActionCenterTab;
  onTabChange?: (tab: ActionCenterTab) => void;
  initialSelectedTicketId?: string | null;
  currentUserId?: string;
  onActionWorkUpdated?: () => void;
  reviewRequests?: import('@/lib/services/member-review-requests').MemberReviewRequestRow[];
  onResolveReviewRequest?: (requestId: string) => void;
  onSetReviewInProgress?: (requestId: string) => void;
  quoteRequests?: import('@/lib/services/quote-requests').QuoteRequestRow[];
  onResolveQuoteRequest?: (requestId: string) => void;
  onSetQuoteInProgress?: (requestId: string) => void;
  /** Fired whenever the ticket detail panel is closed (used to return to a deep-link origin). */
  onDetailClose?: () => void;
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
  tab,
  onTabChange,
  initialSelectedTicketId,
  currentUserId,
  onActionWorkUpdated,
  reviewRequests = [],
  onResolveReviewRequest,
  onSetReviewInProgress,
  quoteRequests = [],
  onResolveQuoteRequest,
  onSetQuoteInProgress,
  onDetailClose,
}: AdminTicketsViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [scope, setScope] = useState<Scope>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('modified');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // Drive selection from an external deep-link (e.g. Message Center mentions).
  // We consume each distinct target id once it can be resolved against the
  // loaded tickets, so the detail panel opens even when the id arrives before
  // the ticket data — without re-opening on later background refreshes.
  const consumedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialSelectedTicketId) {
      consumedDeepLinkRef.current = null;
      return;
    }
    if (consumedDeepLinkRef.current === initialSelectedTicketId) return;
    if (tickets.some((t) => t.id === initialSelectedTicketId)) {
      consumedDeepLinkRef.current = initialSelectedTicketId;
      setSelectedId(initialSelectedTicketId);
    }
  }, [initialSelectedTicketId, tickets]);

  // Sync filters from the sidebar / external tab selection. Each tab value only
  // drives the dimension it represents, preserving the other filter.
  useEffect(() => {
    if (!tab) return;
    if (tab === 'mine') setScope('mine');
    else if (tab === 'all') setScope('all');
    else setKindFilter(tab);
  }, [tab]);

  const deriveTab = (nextScope: Scope, nextKind: KindFilter): ActionCenterTab => {
    if (nextScope === 'mine') return 'mine';
    if (nextKind !== 'all') return nextKind;
    return 'all';
  };

  const updateScope = (nextScope: Scope) => {
    setScope(nextScope);
    onTabChange?.(deriveTab(nextScope, kindFilter));
  };

  const updateKind = (nextKind: KindFilter) => {
    setKindFilter(nextKind);
    onTabChange?.(deriveTab(scope, nextKind));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (scope === 'mine' && !isTicketMine(t, currentUserId)) return false;
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
  }, [tickets, scope, currentUserId, statusFilter, kindFilter, search]);

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
        case 'modified':
          return (
            dir *
            (ticketCreatedTimestamp(a.lastModifiedAt ?? a.createdAt) -
              ticketCreatedTimestamp(b.lastModifiedAt ?? b.createdAt))
          );
        case 'created':
        default:
          return dir * (ticketCreatedTimestamp(a.createdAt) - ticketCreatedTimestamp(b.createdAt));
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

  const reviewById = useMemo(
    () => new Map(reviewRequests.map((r) => [r.id, r])),
    [reviewRequests],
  );
  const quoteById = useMemo(
    () => new Map(quoteRequests.map((r) => [r.id, r])),
    [quoteRequests],
  );

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;

  const closeDetail = () => {
    setSelectedId(null);
    onDetailClose?.();
  };

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

      <div className="ac-toolbar">
        <div className="ac-filter">
          <label htmlFor="ac-status">Status</label>
          <select
            id="ac-status"
            className="ac-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <div className="ac-filter">
          <label htmlFor="ac-kind">Action type</label>
          <select
            id="ac-kind"
            className="ac-select"
            value={kindFilter}
            onChange={(e) => updateKind(e.target.value as KindFilter)}
          >
            <option value="all">All actions</option>
            <option value="quote_request">Quote request</option>
            <option value="review_request">Review request</option>
            <option value="analysis_review">Analysis review</option>
            <option value="statement">Statement review</option>
            <option value="service">Service ticket</option>
            <option value="analysis">Analysis</option>
            <option value="renewal">Contract renewal</option>
            <option value="optimization">Savings opportunity</option>
          </select>
        </div>
        <div className="ac-filter">
          <label>Actions</label>
          <div className="ac-scope" role="group" aria-label="Action scope">
            <button
              type="button"
              className={`ac-scope-btn${scope === 'mine' ? ' active' : ''}`}
              onClick={() => updateScope('mine')}
            >
              My Actions
            </button>
            <button
              type="button"
              className={`ac-scope-btn${scope === 'all' ? ' active' : ''}`}
              onClick={() => updateScope('all')}
            >
              All Actions
            </button>
          </div>
        </div>
        <div className="ac-filter ac-filter--search">
          <label htmlFor="ac-search">Search</label>
          <input
            id="ac-search"
            className="ac-search"
            type="search"
            placeholder="Search customer, subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-tickets-table">
            <thead>
              <tr>
                <th>Action</th>
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
                <th>Team</th>
                <SortableTableHeader
                  label="Last modified"
                  active={sortKey === 'modified'}
                  direction={sortDir}
                  onClick={() => onSort('modified')}
                />
                <SortableTableHeader
                  label="Created"
                  active={sortKey === 'created'}
                  direction={sortDir}
                  onClick={() => onSort('created')}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--gray)' }}>
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
                    <td onClick={(e) => e.stopPropagation()}>
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
                    <td>
                      <div className="admin-ticket-team">
                        {t.assignees && t.assignees.length > 0 ? (
                          <div className="admin-ticket-chips">
                            {t.assignees.map((a) => (
                              <span
                                key={a.userId}
                                className={`admin-ticket-chip${a.claimed ? ' claimed' : ''}`}
                                title={
                                  a.claimed
                                    ? `${a.name} — working on it`
                                    : `${a.name} — assigned, not claimed`
                                }
                              >
                                {a.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="admin-ticket-unassigned">Unassigned</span>
                        )}
                      </div>
                    </td>
                    <td className="admin-ticket-time">
                      {formatAdminTicketCreated(t.lastModifiedAt ?? t.createdAt)}
                    </td>
                    <td className="admin-ticket-time">{formatAdminTicketCreated(t.createdAt)}</td>
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
          reviewRequest={selected?.kind === 'review_request' ? reviewById.get(selected.sourceId) ?? null : null}
          quoteRequest={selected?.kind === 'quote_request' ? quoteById.get(selected.sourceId) ?? null : null}
          onResolveReviewRequest={(id) => {
            onResolveReviewRequest?.(id);
            handleResolved();
          }}
          onSetReviewInProgress={(id) => {
            onSetReviewInProgress?.(id);
          }}
          onResolveQuoteRequest={(id) => {
            onResolveQuoteRequest?.(id);
            handleResolved();
          }}
          onSetQuoteInProgress={(id) => {
            onSetQuoteInProgress?.(id);
          }}
          currentUserId={currentUserId}
          onActionWorkUpdated={onActionWorkUpdated}
          portalCustomers={portalCustomers}
        />
      )}
    </div>
  );
}
