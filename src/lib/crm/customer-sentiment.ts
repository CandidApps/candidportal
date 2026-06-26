// Client types + fetchers for the account "relationship pulse" — a cached
// read on how a customer relationship is trending, similar to an AI contact
// center's sentiment scoring.

export type SentimentLevel = 'good' | 'neutral' | 'at_risk' | 'urgent' | 'unknown';

export type CustomerSentiment = {
  level: SentimentLevel;
  headline: string;
  signals: string[];
  lastContactAt: string | null;
  awaitingReply: boolean;
  generatedAt: string | null;
};

export const SENTIMENT_META: Record<
  SentimentLevel,
  { label: string; tone: string }
> = {
  good: { label: 'Healthy', tone: 'good' },
  neutral: { label: 'Steady', tone: 'neutral' },
  at_risk: { label: 'Needs attention', tone: 'at_risk' },
  urgent: { label: 'At risk', tone: 'urgent' },
  unknown: { label: 'No signal yet', tone: 'unknown' },
};

export async function fetchCustomerSentiment(
  customerId: string,
): Promise<{ sentiment: CustomerSentiment | null; stale: boolean }> {
  const res = await fetch(
    `/api/admin/customers/sentiment?customerId=${encodeURIComponent(customerId)}`,
  );
  if (!res.ok) throw new Error('Failed to load sentiment');
  return (await res.json()) as { sentiment: CustomerSentiment | null; stale: boolean };
}

export async function refreshCustomerSentiment(input: {
  customerId: string;
  email?: string | null;
  customerName?: string | null;
}): Promise<CustomerSentiment> {
  const res = await fetch('/api/admin/customers/sentiment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { sentiment?: CustomerSentiment; error?: string };
  if (!res.ok || !json.sentiment) throw new Error(json.error ?? 'Failed to read sentiment');
  return json.sentiment;
}
