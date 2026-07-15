'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

type StatusFilterValue = AdminTicketStatus;
type Scope = 'mine' | 'all';
type SortKey = 'kind' | 'status' | 'customer' | 'subject' | 'created' | 'modified';

const DEFAULT_STATUS_FILTERS: StatusFilterValue[] = ['open', 'in_progress'];

/** Ordered Action type options for the multi-check filter. Empty selection = all types. */
const ACTION_TYPE_OPTIONS: AdminTicketKind[] = [
  'customer_message',
  'quote_request',
  'submit_contract',
  'submit_contract_to_customer',
  'review_request',
  'analysis_review',
  'statement',
  'service',
  'service_request',
  'analysis',
  'renewal',
  'optimization',
];

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
  onOpenQuoteRequest?: (quoteRequestId: string) => void;
  onOpenCustomerMessage?: (threadId: string) => void;
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
  onReplyReviewRequest?: (requestId: string, message: string) => Promise<boolean>;
  quoteRequests?: import('@/lib/services/quote-requests').QuoteRequestRow[];
  onResolveQuoteRequest?: (requestId: string) => void;
  onSetQuoteInProgress?: (requestId: string) => void;
  contractSubmitActions?: import('@/lib/services/contract-submit-actions').ContractSubmitActionRow[];
  onResolveContractSubmit?: (actionId: string) => void;
  onSetContractSubmitInProgress?: (actionId: string) => void;
  onReplyServiceTicket?: (ticketId: string, message: string) => Promise<boolean>;
  /** Fired whenever the ticket detail panel is closed (used to return to a deep-link origin). */
  onDetailClose?: () => void;
  onOpenCustomer?: (customerId: string) => void;
  onOpenLead?: (leadKey: string) => void;
  portalLeads?: import('@/components/LeadsView').Lead[];
  customers?: import('@/components/CustomersView').Customer[];
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
  onOpenQuoteRequest,
  onOpenCustomerMessage,
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
  onReplyReviewRequest,
  quoteRequests = [],
  onResolveQuoteRequest,
  onSetQuoteInProgress,
  contractSubmitActions = [],
  onResolveContractSubmit,
  onSetContractSubmitInProgress,
  onReplyServiceTicket,
  onDetailClose,
  onOpenCustomer,
  onOpenLead,
  portalLeads = [],
  customers = [],
}: AdminTicketsViewProps) {
  const [statusFilters, setStatusFilters] = useState<Set<StatusFilterValue>>(
    () => new Set(DEFAULT_STATUS_FILTERS),
  );
  /** Empty set = all action types. */
  const [kindFilters, setKindFilters] = useState<Set<AdminTicketKind>>(() => new Set());
  const [kindMenuOpen, setKindMenuOpen] = useState(false);
  const [kindMenuStyle, setKindMenuStyle] = useState<React.CSSProperties>({});
  const kindTriggerRef = useRef<HTMLButtonElement>(null);
  const kindMenuRef = useRef<HTMLDivElement>(null);
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
    if (tab === 'mine') {
      setScope('mine');
      return;
    }
    if (tab === 'all') {
      setScope('all');
      setKindFilters(new Set());
      return;
    }
    setKindFilters(new Set([tab]));
  }, [tab]);

  const deriveTab = (nextScope: Scope, nextKinds: Set<AdminTicketKind>): ActionCenterTab => {
    if (nextScope === 'mine') return 'mine';
    if (nextKinds.size === 1) return [...nextKinds][0];
    return 'all';
  };

  const updateScope = (nextScope: Scope) => {
    setScope(nextScope);
    onTabChange?.(deriveTab(nextScope, kindFilters));
  };

  const toggleKind = (kind: AdminTicketKind) => {
    setKindFilters((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      onTabChange?.(deriveTab(scope, next));
      return next;
    });
  };

  const clearKindFilters = () => {
    const next = new Set<AdminTicketKind>();
    setKindFilters(next);
    onTabChange?.(deriveTab(scope, next));
  };

  useLayoutEffect(() => {
    if (!kindMenuOpen || !kindTriggerRef.current) return;
    const rect = kindTriggerRef.current.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 220);
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - menuWidth - 12);
    }
    setKindMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left,
      minWidth: menuWidth,
      zIndex: 10000,
    });
  }, [kindMenuOpen]);

  useEffect(() => {
    if (!kindMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (kindTriggerRef.current?.contains(target) || kindMenuRef.current?.contains(target)) return;
      setKindMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setKindMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [kindMenuOpen]);

  const toggleStatus = (status: StatusFilterValue) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        // Keep at least one status selected so the list never goes blank by accident.
        if (next.size === 1) return prev;
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const kindSummary = useMemo(() => {
    if (kindFilters.size === 0) return 'All actions';
    if (kindFilters.size === 1) return TICKET_KIND_LABEL[[...kindFilters][0]];
    return `${kindFilters.size} types selected`;
  }, [kindFilters]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (scope === 'mine' && !isTicketMine(t, currentUserId)) return false;
      if (!statusFilters.has(t.status)) return false;
      if (kindFilters.size > 0 && !kindFilters.has(t.kind)) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.detail.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.customerEmail.toLowerCase().includes(q)
      );
    });
  }, [tickets, scope, currentUserId, statusFilters, kindFilters, search]);

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

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const direct = tickets.find((t) => t.id === selectedId);
    if (direct) return direct;
    // Remap legacy customer-stage ticket ids and keep selection across pipeline advances.
    const legacyCustomer = selectedId.startsWith('submit-contract-customer-')
      ? selectedId.slice('submit-contract-customer-'.length)
      : null;
    const stableContract = selectedId.startsWith('submit-contract-')
      ? selectedId.slice('submit-contract-'.length)
      : null;
    const sourceId = legacyCustomer || stableContract;
    if (!sourceId) return null;
    return (
      tickets.find(
        (t) =>
          (t.kind === 'submit_contract' || t.kind === 'submit_contract_to_customer') &&
          t.sourceId === sourceId,
      ) ?? null
    );
  }, [selectedId, tickets]);

  useEffect(() => {
    if (!selected || !selectedId || selected.id === selectedId) return;
    setSelectedId(selected.id);
  }, [selected, selectedId]);

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
  const contractSubmitById = useMemo(
    () => new Map(contractSubmitActions.map((r) => [r.id, r])),
    [contractSubmitActions],
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
          <label>Status</label>
          <div className="ac-scope" role="group" aria-label="Status filter">
            {(
              [
                { id: 'open', label: 'Open' },
                { id: 'in_progress', label: 'In progress' },
                { id: 'resolved', label: 'Resolved' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`ac-scope-btn${statusFilters.has(opt.id) ? ' active' : ''}`}
                aria-pressed={statusFilters.has(opt.id)}
                onClick={() => toggleStatus(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ac-filter">
          <label id="ac-kind-label">Action type</label>
          <div className="ac-kind-multi">
            <button
              ref={kindTriggerRef}
              type="button"
              id="ac-kind"
              className="ac-select ac-kind-multi-trigger"
              aria-labelledby="ac-kind-label"
              aria-haspopup="listbox"
              aria-expanded={kindMenuOpen}
              onClick={() => setKindMenuOpen((v) => !v)}
              title={
                kindFilters.size
                  ? [...kindFilters].map((k) => TICKET_KIND_LABEL[k]).join(', ')
                  : 'All actions'
              }
            >
              <span className="ac-kind-multi-summary">{kindSummary}</span>
              <span className="ac-kind-multi-caret" aria-hidden>
                ▾
              </span>
            </button>
            {kindMenuOpen &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={kindMenuRef}
                  className="ac-kind-multi-menu"
                  style={kindMenuStyle}
                  role="listbox"
                  aria-multiselectable
                  aria-labelledby="ac-kind-label"
                >
                  {ACTION_TYPE_OPTIONS.map((kind) => (
                    <label key={kind} className="ac-kind-multi-option">
                      <input
                        type="checkbox"
                        checked={kindFilters.has(kind)}
                        onChange={() => toggleKind(kind)}
                      />
                      <span>{TICKET_KIND_LABEL[kind]}</span>
                    </label>
                  ))}
                  <button
                    type="button"
                    className="ac-kind-multi-clear"
                    onClick={() => {
                      clearKindFilters();
                      setKindMenuOpen(false);
                    }}
                  >
                    Clear (all types)
                  </button>
                </div>,
                document.body,
              )}
          </div>
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
                      if (t.kind === 'quote_request' && onOpenQuoteRequest) {
                        onOpenQuoteRequest(t.sourceId);
                        return;
                      }
                      if (t.kind === 'customer_message' && onOpenCustomerMessage) {
                        onOpenCustomerMessage(t.sourceId);
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
                          if (t.kind === 'quote_request' && onOpenQuoteRequest) {
                            onOpenQuoteRequest(t.sourceId);
                            return;
                          }
                          if (t.kind === 'customer_message' && onOpenCustomerMessage) {
                            onOpenCustomerMessage(t.sourceId);
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
                        {t.statusLabel ?? t.status.replace('_', ' ')}
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
          contractSubmitAction={
            selected?.kind === 'submit_contract' || selected?.kind === 'submit_contract_to_customer'
              ? contractSubmitById.get(selected.sourceId) ?? null
              : null
          }
          onResolveReviewRequest={(id) => {
            onResolveReviewRequest?.(id);
            handleResolved();
          }}
          onSetReviewInProgress={(id) => {
            onSetReviewInProgress?.(id);
          }}
          onReplyReviewRequest={onReplyReviewRequest}
          onReplyServiceTicket={onReplyServiceTicket}
          onResolveQuoteRequest={(id) => {
            onResolveQuoteRequest?.(id);
            handleResolved();
          }}
          onSetQuoteInProgress={(id) => {
            onSetQuoteInProgress?.(id);
          }}
          onResolveContractSubmit={(id) => {
            onResolveContractSubmit?.(id);
            handleResolved();
          }}
          onSetContractSubmitInProgress={(id) => {
            onSetContractSubmitInProgress?.(id);
          }}
          onContractPipelineUpdated={onActionWorkUpdated}
          currentUserId={currentUserId}
          onActionWorkUpdated={onActionWorkUpdated}
          portalCustomers={portalCustomers}
          onOpenCustomer={onOpenCustomer}
          onOpenLead={onOpenLead}
          portalLeads={portalLeads}
          customers={customers}
        />
      )}
    </div>
  );
}
