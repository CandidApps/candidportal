'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  fetchCustomerSentiment,
  refreshCustomerSentiment,
  resolveCustomerSentiment,
  SENTIMENT_META,
  type CustomerSentiment,
} from '@/lib/crm/customer-sentiment';

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const days = Math.floor((Date.now() - d) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function CustomerRelationshipPulse({
  customerId,
  customerName,
  contactEmail,
  onVisibilityChange,
}: {
  customerId: string;
  customerName: string;
  contactEmail?: string;
  /** Parent side-nav only lists Pulse when this reports true. */
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const [sentiment, setSentiment] = useState<CustomerSentiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [confirming, setConfirming] = useState(false);

  const unknownFallback = useCallback(
    (headline: string): CustomerSentiment => ({
      level: 'unknown',
      headline,
      signals: [],
      lastContactAt: null,
      awaitingReply: false,
      generatedAt: null,
    }),
    [],
  );

  const load = useCallback(async () => {
    try {
      const { sentiment: cached, stale } = await fetchCustomerSentiment(customerId);
      if (cached && !stale) {
        setSentiment(cached);
        return;
      }
      if (!contactEmail) {
        setSentiment(
          cached ?? unknownFallback('Add a contact email to read relationship sentiment.'),
        );
        return;
      }
      setRefreshing(true);
      const fresh = await refreshCustomerSentiment({
        customerId,
        email: contactEmail,
        customerName,
      });
      setSentiment(fresh);
    } catch {
      // Keep a soft card instead of disappearing — side nav stays in sync via onVisibilityChange.
      setSentiment(
        unknownFallback(
          contactEmail
            ? 'Could not load relationship sentiment right now. Try refresh.'
            : 'Add a contact email to read relationship sentiment.',
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, customerName, contactEmail, unknownFallback]);

  useEffect(() => {
    setLoading(true);
    onVisibilityChange?.(false);
    void load();
  }, [load, onVisibilityChange]);

  useEffect(() => {
    onVisibilityChange?.(Boolean(sentiment) || loading);
  }, [sentiment, loading, onVisibilityChange]);

  const markResolved = async () => {
    if (resolving) return;
    setResolving(true);
    try {
      const next = await resolveCustomerSentiment({
        customerId,
        note: resolveNote.trim() || undefined,
      });
      setSentiment(next);
      setConfirming(false);
      setResolveNote('');
    } catch {
      /* keep current */
    } finally {
      setResolving(false);
    }
  };

  if (loading && !sentiment) {
    return (
      <div className="acct-pulse acct-pulse--loading">
        <span className="assist-spinner" /> Reading relationship…
      </div>
    );
  }

  if (!sentiment) return null;

  const meta = SENTIMENT_META[sentiment.level];
  const needsAttention =
    sentiment.awaitingReply ||
    sentiment.level === 'at_risk' ||
    sentiment.level === 'urgent';
  const alreadyResolved = Boolean(sentiment.resolvedAt) && !sentiment.awaitingReply;

  return (
    <div id="acct-sec-pulse" className={`acct-pulse acct-pulse--${meta.tone}`} style={{ scrollMarginTop: 8 }}>
      <div className="acct-pulse-head">
        <div className="acct-pulse-title">
          <AppIcon name="specialist" size={14} />
          Relationship pulse
          <span className={`acct-pulse-badge acct-pulse-badge--${meta.tone}`}>{meta.label}</span>
        </div>
        <button
          type="button"
          className="acct-pulse-refresh"
          onClick={() => void load()}
          disabled={refreshing}
          title="Refresh sentiment"
        >
          <AppIcon name="sync" size={11} className={refreshing ? 'spin' : undefined} />
        </button>
      </div>
      <p className="acct-pulse-headline">{sentiment.headline}</p>
      {sentiment.signals.length > 0 && (
        <ul className="acct-pulse-signals">
          {sentiment.signals.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
      <div className="acct-pulse-meta">
        {sentiment.lastContactAt && (
          <span>Last contact {relativeTime(sentiment.lastContactAt)}</span>
        )}
        {sentiment.awaitingReply && (
          <span className="acct-pulse-awaiting">
            <AppIcon name="email" size={10} /> Awaiting our reply
          </span>
        )}
        {alreadyResolved ? (
          <span className="acct-pulse-resolved">
            Resolved {relativeTime(sentiment.resolvedAt ?? null)}
            {sentiment.resolveNote ? ` — ${sentiment.resolveNote}` : ''}
          </span>
        ) : null}
      </div>

      <div className="acct-pulse-resolve">
        <label className="acct-pulse-resolve-check">
          <input
            type="checkbox"
            checked={alreadyResolved && !confirming}
            disabled={resolving || (alreadyResolved && !needsAttention)}
            onChange={(e) => {
              if (e.target.checked) setConfirming(true);
              else setConfirming(false);
            }}
          />
          <span>We&apos;ve resolved this</span>
        </label>
        <p className="acct-pulse-resolve-hint">
          Use this when you handled it offline (phone, in person) or the email thread is outdated.
        </p>
        {confirming ? (
          <div className="acct-pulse-resolve-form">
            <input
              type="text"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="Optional note — e.g. called Debbie; email was outdated"
              disabled={resolving}
            />
            <div className="acct-pulse-resolve-actions">
              <button
                type="button"
                className="admin-ticket-btn primary"
                disabled={resolving}
                onClick={() => void markResolved()}
              >
                {resolving ? 'Saving…' : 'Confirm resolved'}
              </button>
              <button
                type="button"
                className="admin-ticket-btn"
                disabled={resolving}
                onClick={() => {
                  setConfirming(false);
                  setResolveNote('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
