'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import { fetchAdminAnalysisReviews } from '@/lib/submit-bill-analysis';
import { formatReviewTime } from '@/lib/services/analysis-reviews';
import { formatCategoriesLabel, normalizeReviewCategories } from '@/lib/provider-categories';
import { AnalysisReviewDetailPanel } from '@/components/admin/AnalysisReviewDetailPanel';
import { SortableTableHeader, toggleSortKey, type SortDirection } from '@/components/admin/SortableTableHeader';
import type { Customer } from '@/components/CustomersView';

type StatusFilter = 'pending_review' | 'in_progress' | 'published' | 'all';
type SortKey = 'status' | 'customer' | 'vendor' | 'category' | 'created';

const REVIEW_STATUS_ORDER: Record<BillAnalysisReviewRow['status'], number> = {
  pending_review: 0,
  in_progress: 1,
  published: 2,
  dismissed: 3,
};

export function AdminAnalysisReviewView({
  initialReviewId = null,
  onInitialConsumed,
  onPublished,
  embedMode = false,
  customers = [],
  onOpenCustomer,
}: {
  initialReviewId?: string | null;
  onInitialConsumed?: () => void;
  onPublished?: () => void;
  embedMode?: boolean;
  customers?: Customer[];
  onOpenCustomer?: (customerId: string) => void;
}) {
  const [reviews, setReviews] = useState<BillAnalysisReviewRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(initialReviewId ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchAdminAnalysisReviews(statusFilter === 'all' ? undefined : statusFilter);
      setReviews(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialReviewId) setSelectedId(initialReviewId);
  }, [initialReviewId]);

  useEffect(() => {
    void reload();
  }, [statusFilter]);

  const pendingCount = useMemo(
    () => reviews.filter((r) => r.status === 'pending_review' || r.status === 'in_progress').length,
    [reviews],
  );

  const sortedReviews = useMemo(() => {
    const rows = [...reviews];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'status':
          return (
            dir *
            ((REVIEW_STATUS_ORDER[a.status] ?? 0) - (REVIEW_STATUS_ORDER[b.status] ?? 0) ||
              a.status.localeCompare(b.status))
          );
        case 'customer': {
          const aName = a.customer_name || '';
          const bName = b.customer_name || '';
          const byName = aName.localeCompare(bName, undefined, { sensitivity: 'base' });
          if (byName !== 0) return dir * byName;
          return dir * (a.customer_email ?? '').localeCompare(b.customer_email ?? '', undefined, {
            sensitivity: 'base',
          });
        }
        case 'vendor':
          return dir * a.vendor_name.localeCompare(b.vendor_name, undefined, { sensitivity: 'base' });
        case 'category': {
          const aLabel = formatCategoriesLabel(
            a.detected_categories ?? (a.detected_category ? [a.detected_category] : []),
          );
          const bLabel = formatCategoriesLabel(
            b.detected_categories ?? (b.detected_category ? [b.detected_category] : []),
          );
          return dir * aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
        }
        case 'created':
        default:
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
    });
    return rows;
  }, [reviews, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    const next = toggleSortKey(sortKey, sortDir, key, key === 'created' ? 'desc' : 'asc');
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  if (selectedId) {
    return (
      <AnalysisReviewDetailPanel
        reviewId={selectedId}
        onClose={() => {
          setSelectedId(null);
          onInitialConsumed?.();
        }}
        onPublished={() => {
          onPublished?.();
          void reload();
        }}
        onDraftSaved={() => {
          void reload();
        }}
        customers={customers}
        onOpenCustomer={onOpenCustomer}
      />
    );
  }

  return (
    <div>
      {!embedMode && (
        <div className="greeting">
          <h2>Analysis Review</h2>
          <p>
            Review uploaded bills, verify parsed categories, adjust Our rate schedules, and publish savings analyses to
            customers.
          </p>
        </div>
      )}

      {error && <p style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</p>}

      <div className="admin-tickets-toolbar">
        <div className="admin-tickets-tabs">
          {(
            [
              ['pending_review', 'Pending review'],
              ['in_progress', 'In progress'],
              ['published', 'Published'],
              ['all', 'All'],
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
      </div>

      {!embedMode && (
        <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 16 }}>
          <div className="kpi amber">
            <div className="kpi-label">Awaiting review</div>
            <div className="kpi-value">{pendingCount}</div>
          </div>
          <div className="kpi blue">
            <div className="kpi-label">Shown</div>
            <div className="kpi-value">{reviews.length}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {loading ? (
            <p style={{ padding: 24, color: 'var(--gray)' }}>Loading reviews…</p>
          ) : reviews.length === 0 ? (
            <p style={{ padding: 24, color: 'var(--gray)' }}>No analysis reviews in this queue.</p>
          ) : (
            <table className="admin-tickets-table">
              <thead>
                <tr>
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
                    label="Vendor"
                    active={sortKey === 'vendor'}
                    direction={sortDir}
                    onClick={() => onSort('vendor')}
                  />
                  <SortableTableHeader
                    label="Category"
                    active={sortKey === 'category'}
                    direction={sortDir}
                    onClick={() => onSort('category')}
                  />
                  <SortableTableHeader
                    label="Created"
                    active={sortKey === 'created'}
                    direction={sortDir}
                    onClick={() => onSort('created')}
                  />
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedReviews.map((r) => (
                  <tr key={r.id} className="admin-tickets-row">
                    <td>
                      <span className={`admin-status-pill admin-status-pill--${r.status === 'published' ? 'resolved' : 'open'}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="admin-ticket-customer">{r.customer_name || 'Customer'}</div>
                      <div className="admin-ticket-email">{r.customer_email}</div>
                    </td>
                    <td>{r.vendor_name}</td>
                    <td>
                      {formatCategoriesLabel(
                        r.detected_categories ?? (r.detected_category ? [r.detected_category] : []),
                      )}
                    </td>
                    <td className="admin-ticket-time">{formatReviewTime(r.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="admin-ticket-btn primary" onClick={() => setSelectedId(r.id)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
