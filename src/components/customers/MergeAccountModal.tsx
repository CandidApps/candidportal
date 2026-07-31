'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Customer, Location } from '@/components/CustomersView';
import type { MergeCustomerOptions } from '@/lib/crm/merge-customers';
import { BRAND } from '@/lib/ui/brand-tokens';

export type MergeAccountModalOptions = MergeCustomerOptions;

type Props = {
  source: Customer;
  accounts: Customer[];
  dealCount?: number;
  onClose: () => void;
  onMerge: (targetCustomerId: string, options: MergeAccountModalOptions) => void | Promise<void>;
};

function formatLocationLine(loc?: Location | null): string {
  if (!loc) return 'No address on file — you can edit after merge.';
  const parts = [loc.street, loc.city, loc.state, loc.zip].filter(Boolean);
  return parts.length ? parts.join(', ') : 'No address on file — you can edit after merge.';
}

export function MergeAccountModal({ source, accounts, dealCount = 0, onClose, onMerge }: Props) {
  const [query, setQuery] = useState('');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addAsLocation, setAddAsLocation] = useState(true);
  const [locationLabel, setLocationLabel] = useState(source.company);
  const [linkDeals, setLinkDeals] = useState(true);

  useEffect(() => {
    setLocationLabel(source.company);
  }, [source.company]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts
      .filter((c) => c.id !== source.id && !c.archivedAt)
      .filter((c) => !q || c.company.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .slice(0, 40);
  }, [accounts, source.id, query]);

  const target = accounts.find((c) => c.id === targetId);
  const sourcePrimary =
    source.locations.find((l) => l.isPrimary) ?? source.locations[0] ?? null;

  const submit = async () => {
    if (!targetId || busy) return;
    setBusy(true);
    setError('');
    try {
      await onMerge(targetId, {
        addAsSingleLocation: addAsLocation,
        mergedLocationLabel: locationLabel.trim() || source.company,
        linkDealsToLocation: linkDeals,
      });
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
          width: 560,
          maxWidth: '96vw',
          maxHeight: '92vh',
          background: BRAND.white,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
          display: 'flex',
          flexDirection: 'column',
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
            Contacts, contracts, and files follow. The duplicate account is archived.
          </div>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
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
              maxHeight: 160,
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
            <div
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 10,
                border: `1px solid ${BRAND.grayBorder}`,
                background: BRAND.grayLight,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.grayDark, marginBottom: 10 }}>
                Location on <strong>{target.company}</strong>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 13,
                  color: BRAND.grayDark,
                  cursor: 'pointer',
                  marginBottom: addAsLocation ? 12 : 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={addAsLocation}
                  onChange={(e) => setAddAsLocation(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  Add <strong>{source.company}</strong> as a location on the target account
                  <span style={{ display: 'block', fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
                    Uses the merged account&apos;s primary address. Other source locations are not copied separately.
                  </span>
                </span>
              </label>

              {addAsLocation ? (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: BRAND.gray, marginBottom: 4 }}>
                    Location name
                  </label>
                  <input
                    value={locationLabel}
                    onChange={(e) => setLocationLabel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      border: `1px solid ${BRAND.grayBorder}`,
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  />
                  <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 6, lineHeight: 1.45 }}>
                    {formatLocationLine(sourcePrimary)}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 11, color: BRAND.gray, margin: '0 0 12px', lineHeight: 1.45 }}>
                  Each source location ({source.locations.length}) will be added as its own sub-location on the target.
                </p>
              )}

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 13,
                  color: BRAND.grayDark,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={linkDeals}
                  onChange={(e) => setLinkDeals(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  Link {dealCount > 0 ? `${dealCount} deal${dealCount === 1 ? '' : 's'}` : 'deals'} to this location
                  <span style={{ display: 'block', fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
                    Contracts and files from the merged account will show under that location.
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          {target ? (
            <p style={{ margin: '14px 0 0', fontSize: 12, color: BRAND.gray, lineHeight: 1.5 }}>
              <strong style={{ color: BRAND.grayDark }}>{source.company}</strong> →{' '}
              <strong style={{ color: BRAND.grayDark }}>{target.company}</strong>
              {source.contacts.length > 0 ? ` · ${source.contacts.length} contact(s)` : null}
            </p>
          ) : null}

          {error ? (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: BRAND.red }}>{error}</p>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '16px 24px',
            borderTop: `1px solid ${BRAND.grayBorder}`,
          }}
        >
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
  );
}
