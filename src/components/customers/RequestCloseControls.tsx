'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { CloseRequestDialog, announceRequestsClosed } from '@/components/customers/CloseRequestDialog';
import {
  applyRequestCloseAction,
  closedRequestLabel,
  closedRequestSummary,
  type ClosableRequestKind,
  type ClosedRequestFields,
  type ClosedRequestStatus,
} from '@/lib/services/request-close';

/** Selection + close/cancel/reopen state for an account's quote or analysis list. */
export function useRequestCloser(kind: ClosableRequestKind, onChanged?: () => void) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dialogIds, setDialogIds] = useState<string[] | null>(null);
  const [dialogDefault, setDialogDefault] = useState<'close' | 'cancel'>('close');
  const [reopening, setReopening] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openDialog = useCallback((ids: string[], defaultAction: 'close' | 'cancel' = 'close') => {
    if (!ids.length) return;
    setDialogDefault(defaultAction);
    setDialogIds(ids);
  }, []);

  const finish = useCallback(() => {
    announceRequestsClosed(kind);
    onChanged?.();
  }, [kind, onChanged]);

  const reopen = useCallback(
    async (id: string) => {
      setReopening(id);
      try {
        await applyRequestCloseAction({ kind, ids: [id], action: 'reopen' });
        finish();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Could not reopen');
      } finally {
        setReopening(null);
      }
    },
    [kind, finish],
  );

  const dialog = dialogIds ? (
    <CloseRequestDialog
      kind={kind}
      count={dialogIds.length}
      defaultAction={dialogDefault}
      onClose={() => setDialogIds(null)}
      onConfirm={async (action, reason) => {
        await applyRequestCloseAction({ kind, ids: dialogIds, action, reason });
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of dialogIds) next.delete(id);
          return next;
        });
        setDialogIds(null);
        finish();
      }}
    />
  ) : null;

  return {
    selected,
    toggle,
    clearSelection: () => setSelected(new Set()),
    openDialog,
    reopen,
    reopening,
    dialog,
  };
}

export function RequestBulkBar({
  count,
  noun,
  onCloseOrCancel,
  onCancelDuplicates,
  onClear,
}: {
  count: number;
  noun: [string, string];
  onCloseOrCancel: () => void;
  onCancelDuplicates: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="req-bulk-bar" role="region" aria-label="Selected items">
      <span className="req-bulk-count">
        {count} {noun[count === 1 ? 0 : 1]} selected
      </span>
      <button type="button" className="admin-ticket-btn" onClick={onCancelDuplicates}>
        Cancel duplicates
      </button>
      <button type="button" className="admin-ticket-btn" onClick={onCloseOrCancel}>
        Close / cancel…
      </button>
      <button type="button" className="admin-ticket-btn subtle" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

export function RowSelectCheckbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <td className="req-select-cell" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${label}`} />
    </td>
  );
}

type ClosedRow = ClosedRequestFields & { id: string; status: string };

export function ClosedRequestsCard<T extends ClosedRow>({
  title,
  rows,
  renderName,
  reopening,
  onReopen,
}: {
  title: string;
  rows: T[];
  renderName: (row: T) => ReactNode;
  reopening: string | null;
  onReopen?: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <details className="card req-closed-card" style={{ marginTop: 16 }}>
      <summary className="card-header">
        <div className="card-title">
          {title} ({rows.length})
        </div>
      </summary>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-tickets-table">
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="admin-tickets-row">
                <td>
                  <span className={`admin-status-pill admin-status-pill--${row.status}`}>
                    {closedRequestLabel(row.status as ClosedRequestStatus)}
                  </span>
                </td>
                <td>
                  <div style={{ fontWeight: 600, color: 'var(--gray-dark)' }}>{renderName(row)}</div>
                  <div className="req-closed-meta">{closedRequestSummary(row)}</div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {onReopen ? (
                    <button
                      type="button"
                      className="admin-ticket-btn"
                      disabled={reopening === row.id}
                      onClick={() => onReopen(row.id)}
                    >
                      {reopening === row.id ? 'Reopening…' : 'Reopen'}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
