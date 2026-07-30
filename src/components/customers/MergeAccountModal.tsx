'use client';

import { useMemo, useState } from 'react';
import type { Customer } from '@/components/CustomersView';
import { BRAND } from '@/lib/ui/brand-tokens';

type Props = {
  source: Customer;
  accounts: Customer[];
  onClose: () => void;
  onMerge: (targetCustomerId: string) => void | Promise<void>;
};

export function MergeAccountModal({ source, accounts, onClose, onMerge }: Props) {
  const [query, setQuery] = useState('');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts
      .filter((c) => c.id !== source.id && !c.archivedAt)
      .filter((c) => !q || c.company.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .slice(0, 40);
  }, [accounts, source.id, query]);

  const target = accounts.find((c) => c.id === targetId);

  const submit = async () => {
    if (!targetId || busy) return;
    setBusy(true);
    setError('');
    try {
      await onMerge(targetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed');
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => !busy && onClose()}
    >
      <div
        style={{
          width: 520,
          maxWidth: '96vw',
          background: BRAND.white,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${BRAND.grayBorder}`,
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: BRAND.grayDark }}>
            Merge into another account
          </div>
          <div style={{ fontSize: 12, color: BRAND.gray, marginTop: 6, lineHeight: 1.5 }}>
            Move <strong style={{ color: BRAND.grayDark }}>{source.company}</strong> into an existing account.
            Locations become sub-locations; contacts, contracts, and files follow. The duplicate account is
            archived.
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: BRAND.gray, marginBottom: 6 }}>
            Merge into
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts…"
            style={{
              width: '100%',
              padding: '9px 12px',
              border: `1px solid ${BRAND.grayBorder}`,
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 8,
            }}
          />
          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              border: `1px solid ${BRAND.grayBorder}`,
              borderRadius: 8,
            }}
          >
            {options.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: BRAND.gray }}>No matching accounts.</div>
            ) : (
              options.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setTargetId(c.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    border: 'none',
                    borderBottom: `1px solid ${BRAND.grayBorder}`,
                    background: targetId === c.id ? 'rgba(225,29,72,0.08)' : BRAND.white,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: BRAND.grayDark,
                  }}
                >
                  <strong>{c.company}</strong>
                  <span style={{ color: BRAND.gray, marginLeft: 8 }}>{c.agent}</span>
                </button>
              ))
            )}
          </div>

          {target ? (
            <p style={{ margin: '14px 0 0', fontSize: 12, color: BRAND.gray, lineHeight: 1.5 }}>
              <strong style={{ color: BRAND.grayDark }}>{source.company}</strong> →{' '}
              <strong style={{ color: BRAND.grayDark }}>{target.company}</strong>
              {source.locations.length > 0
                ? ` · ${source.locations.length} location(s) will be added`
                : null}
              {source.contacts.length > 0 ? ` · ${source.contacts.length} contact(s)` : null}
            </p>
          ) : null}

          {error ? (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: BRAND.red }}>{error}</p>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={{
                padding: '8px 14px',
                border: `1px solid ${BRAND.grayBorder}`,
                borderRadius: 8,
                background: BRAND.white,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!targetId || busy}
              onClick={() => void submit()}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: 8,
                background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`,
                color: BRAND.white,
                fontSize: 13,
                fontWeight: 600,
                cursor: targetId && !busy ? 'pointer' : 'not-allowed',
                opacity: targetId && !busy ? 1 : 0.55,
              }}
            >
              {busy ? 'Merging…' : 'Merge accounts'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
