'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AISuggestion } from '@/lib/quotes/quote-request-analysis';

const READ_KEY_PREFIX = 'candid.quoteAiRead.';

const ROUTING_BADGE: Record<
  AISuggestion['routingCheck']['status'],
  { label: string; className: string }
> = {
  confirmed: { label: 'Routing confirmed', className: 'quote-ai-badge--confirmed' },
  mismatch: { label: 'Check this', className: 'quote-ai-badge--mismatch' },
  suspicious: { label: 'Looks like test data', className: 'quote-ai-badge--suspicious' },
};

const ACTION_LABEL: Record<AISuggestion['recommendedAction']['action'], string> = {
  submit_to_supplier: 'Submit to supplier',
  request_info: 'Email customer',
  close_spam: 'Close as spam',
  escalate: 'Escalate for review',
  generate_quote: 'Generate quote',
};

export function QuoteRequestAiSuggestions({
  quoteRequestId,
  contactEmail,
  customerLabel,
  onSubmitToSupplier,
  onGenerateQuote,
  onCloseAsSpam,
  onEmailCustomer,
}: {
  quoteRequestId: string;
  contactEmail?: string | null;
  customerLabel?: string;
  onSubmitToSupplier: () => void;
  onGenerateQuote: () => void;
  onCloseAsSpam: () => void;
  onEmailCustomer: (draft: string) => void;
}) {
  const storageKey = `${READ_KEY_PREFIX}${quoteRequestId}`;
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.localStorage.getItem(storageKey);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/quote-requests/${quoteRequestId}/suggestions`);
      const data = (await res.json()) as { suggestion?: AISuggestion; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed');
      setSuggestion(data.suggestion ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [quoteRequestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      if (!next && typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, '1');
      }
      return next;
    });
  };

  const runAction = () => {
    if (!suggestion) return;
    const { action } = suggestion.recommendedAction;
    if (action === 'submit_to_supplier') onSubmitToSupplier();
    else if (action === 'generate_quote') onGenerateQuote();
    else if (action === 'close_spam') onCloseAsSpam();
    else if (action === 'request_info' || action === 'escalate') {
      onEmailCustomer(suggestion.draftReply ?? '');
    }
  };

  const badge = suggestion ? ROUTING_BADGE[suggestion.routingCheck.status] : null;

  return (
    <div className="card quote-ai-suggestions" style={{ marginBottom: 16 }}>
      <button type="button" className="quote-ai-suggestions-toggle" onClick={toggleExpanded}>
        <div className="quote-ai-suggestions-toggle-main">
          <span className="card-title">AI Suggestions</span>
          {badge ? (
            <span className={`quote-ai-badge ${badge.className}`}>{badge.label}</span>
          ) : loading ? (
            <span className="quote-ai-badge quote-ai-badge--loading">Analyzing…</span>
          ) : null}
        </div>
        <span className="quote-ai-chevron" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded ? (
        <div className="card-body quote-ai-suggestions-body">
          {error ? <p className="form-error">{error}</p> : null}
          {loading && !suggestion ? <p className="text-muted">Running routing checks…</p> : null}
          {suggestion ? (
            <>
              <p className="quote-ai-routing-note">{suggestion.routingCheck.note}</p>
              {suggestion.routingCheck.status === 'mismatch' ? (
                <p className="quote-ai-meta text-muted">
                  Requested: {suggestion.routingCheck.requestedService} · Detected:{' '}
                  {suggestion.routingCheck.detectedService}
                </p>
              ) : null}
              <div className="quote-ai-action-row">
                <p className="quote-ai-reasoning">
                  <strong>{ACTION_LABEL[suggestion.recommendedAction.action]}</strong>
                  {' — '}
                  {suggestion.recommendedAction.reasoning}
                </p>
                <button type="button" className="btn-primary" onClick={runAction}>
                  {ACTION_LABEL[suggestion.recommendedAction.action]}
                </button>
              </div>
              {suggestion.draftReply && suggestion.recommendedAction.action === 'request_info' ? (
                <details className="quote-ai-draft">
                  <summary>Preview customer email</summary>
                  <pre>{suggestion.draftReply}</pre>
                </details>
              ) : null}
              {!contactEmail && suggestion.recommendedAction.action === 'request_info' ? (
                <p className="text-muted" style={{ marginTop: 8 }}>
                  No email on file for {customerLabel ?? 'this customer'} — add contact email before sending.
                </p>
              ) : null}
            </>
          ) : null}
          {!loading ? (
            <button type="button" className="btn-link quote-ai-reanalyze" onClick={() => void load()}>
              Re-analyze
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
