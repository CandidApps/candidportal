'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  fetchCustomerSentiment,
  refreshCustomerSentiment,
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
}: {
  customerId: string;
  customerName: string;
  contactEmail?: string;
}) {
  const [sentiment, setSentiment] = useState<CustomerSentiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { sentiment: cached, stale } = await fetchCustomerSentiment(customerId);
      if (cached && !stale) {
        setSentiment(cached);
        return;
      }
      if (!contactEmail) {
        setSentiment(
          cached ?? {
            level: 'unknown',
            headline: 'Add a contact email to read relationship sentiment.',
            signals: [],
            lastContactAt: null,
            awaitingReply: false,
            generatedAt: null,
          },
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
      setSentiment(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, customerName, contactEmail]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  if (loading && !sentiment) {
    return (
      <div className="acct-pulse acct-pulse--loading">
        <span className="assist-spinner" /> Reading relationship…
      </div>
    );
  }

  if (!sentiment) return null;

  const meta = SENTIMENT_META[sentiment.level];

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
      </div>
    </div>
  );
}
