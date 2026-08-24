'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InternetQuoteRequirementsFields } from '@/components/internet/InternetQuoteRequirementsFields';
import { InternetPricingOptionsPanel } from '@/components/internet/InternetPricingOptionsPanel';
import {
  SCOUT_REQUEST_CC,
  SCOUT_REQUEST_TO,
  SATELLITE_REQUEST_CC,
  SATELLITE_REQUEST_TO,
  internetRoutingForConnectionTypes,
  scoutPortalContractUrl,
} from '@/lib/internet/internet-quote-config';
import {
  applyMatchScores,
  buildScoutRequestEmailBody,
  internetSnapshotFromDraft,
} from '@/lib/internet/internet-quote-snapshot';
import { parseScoutLookupEmailHtml } from '@/lib/internet/scout-email-parse';
import type { InternetQuoteSnapshot } from '@/lib/internet/internet-quote-types';
import { INTERNET_QUOTE_ANSWER_KEYS } from '@/lib/internet/internet-quote-types';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import { patchQuoteRequest } from '@/lib/services/quote-requests';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';

function requirementsToAnswers(
  snap: InternetQuoteSnapshot,
): Record<string, string | boolean> {
  const r = snap.requirements;
  return {
    [INTERNET_QUOTE_ANSWER_KEYS.connectionTypes]: JSON.stringify(r.connectionTypes),
    [INTERNET_QUOTE_ANSWER_KEYS.additionalNeeds]: JSON.stringify(r.additionalNeeds),
    [INTERNET_QUOTE_ANSWER_KEYS.desiredSpeed]: r.desiredSpeed,
    [INTERNET_QUOTE_ANSWER_KEYS.serviceAddress]: r.serviceAddress,
    ...(r.billFilename ? { billFilename: r.billFilename } : {}),
    ...(r.billStoragePath ? { billStoragePath: r.billStoragePath } : {}),
    ...(r.analysisReviewId ? { analysisReviewId: r.analysisReviewId } : {}),
  };
}

export function InternetQuoteBuilder({
  row,
  draft,
  onDraftChange,
  disabled = false,
  onReload,
}: {
  row: QuoteRequestRow;
  draft: PublishedQuoteSnapshot | null;
  onDraftChange: (next: PublishedQuoteSnapshot) => void;
  disabled?: boolean;
  onReload?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [ingestHtml, setIngestHtml] = useState('');
  const [showIngest, setShowIngest] = useState(false);
  const [autoPollStatus, setAutoPollStatus] = useState('');
  const pollInFlight = useRef(false);

  const internet = useMemo(
    () => internetSnapshotFromDraft(draft, row),
    [draft, row],
  );

  const persist = useCallback(
    async (nextInternet: InternetQuoteSnapshot, draftPatch?: Partial<PublishedQuoteSnapshot>) => {
      const nextDraft: PublishedQuoteSnapshot = {
        serviceTypeId: 'internet',
        serviceLabel: draft?.serviceLabel ?? 'Internet / Broadband',
        quotePath: 'manual',
        ...draft,
        ...draftPatch,
        internetQuote: nextInternet,
      };
      onDraftChange(nextDraft);
      const loc = {
        ...(row.location ?? {}),
        street: nextInternet.requirements.street ?? row.location?.street,
        city: nextInternet.requirements.city ?? row.location?.city,
        state: nextInternet.requirements.state ?? row.location?.state,
        zip: nextInternet.requirements.zip ?? row.location?.zip,
        label: row.location?.label ?? 'Service location',
      };
      await fetch(`/api/admin/quote-requests/${row.id}/internet`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceAnswers: {
            ...(row.service_answers ?? {}),
            ...requirementsToAnswers(nextInternet),
          },
          location: loc,
          draftQuoteSnapshot: nextDraft,
        }),
      });
    },
    [draft, onDraftChange, row],
  );

  const updateInternet = (partial: Partial<InternetQuoteSnapshot>) => {
    const next = { ...internet, ...partial };
    void persist(next);
  };

  const onRequirementsChange = (requirements: InternetQuoteSnapshot['requirements']) => {
    updateInternet({ requirements, workflowStage: internet.workflowStage });
  };

  const sendScoutRequest = () => {
    const addr = internet.requirements.serviceAddress.trim();
    if (!addr || !internet.requirements.connectionTypes.length || !internet.requirements.desiredSpeed.trim()) {
      setNotice('Complete service address, at least one internet type, and desired speed before sending.');
      return;
    }
    const company = row.company?.trim() || 'Customer';
    const routing = internetRoutingForConnectionTypes(internet.requirements.connectionTypes);
    if (routing === 'cellular_rates') {
      setNotice(
        'Cellular selected — use built-in T-Mobile / Verizon / For2Fi rate cards below (supplier rates). No SCOUT email needed.',
      );
      const next: InternetQuoteSnapshot = {
        ...internet,
        workflowStage: 'pricing_review',
      };
      void persist(next);
      return;
    }
    const to = routing === 'satellite_email' ? SATELLITE_REQUEST_TO : SCOUT_REQUEST_TO;
    const cc =
      routing === 'satellite_email'
        ? `${SCOUT_REQUEST_CC}, ${SATELLITE_REQUEST_CC}`
        : SCOUT_REQUEST_CC;
    launchAdminZohoCompose({
      to,
      cc,
      subject:
        routing === 'satellite_email'
          ? `Satellite Quote Request: ${company}`
          : `Internet Quote Request: ${company}`,
      body: buildScoutRequestEmailBody(row, internet.requirements),
      quoteRequestId: row.id,
      contractSubmitIntent: 'supplier',
      contextLabel:
        routing === 'satellite_email' ? 'Telarus satellite quote request' : 'SCOUT internet quote request',
    });
    const next: InternetQuoteSnapshot = {
      ...internet,
      workflowStage: 'scout_pending',
      scoutRequestSentAt: new Date().toISOString(),
    };
    void persist(next);
    setNotice(
      routing === 'satellite_email'
        ? 'Compose window opened — send to Telarus (Kim Rusch CC’d). Waiting for response…'
        : 'Compose window opened — send to SCOUT. Waiting for response email…',
    );
  };

  const ingestScoutResponse = async (htmlOverride?: string) => {
    const html = (htmlOverride ?? ingestHtml).trim();
    if (!html) return;
    setBusy(true);
    setNotice('');
    try {
      const lookup = parseScoutLookupEmailHtml(html);
      const res = await fetch(`/api/admin/quote-requests/${row.id}/internet-scout-ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, lookup }),
      });
      const data = (await res.json()) as { internetQuote?: InternetQuoteSnapshot; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Ingest failed');
      if (data.internetQuote) {
        onDraftChange({
          ...(draft ?? {
            serviceTypeId: 'internet',
            serviceLabel: 'Internet / Broadband',
            quotePath: 'manual',
          }),
          internetQuote: data.internetQuote,
        });
      }
      setShowIngest(false);
      setIngestHtml('');
      setNotice('SCOUT response recorded. Upload pricing PDFs for quotable providers.');
      onReload?.();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not ingest SCOUT email');
    } finally {
      setBusy(false);
    }
  };

  // Auto-parse SCOUT reply from shared/personal mailbox while waiting
  useEffect(() => {
    if (internet.workflowStage !== 'scout_pending' || disabled) return;
    let cancelled = false;

    const poll = async () => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      try {
        if (!cancelled) setAutoPollStatus('Checking mailbox for SCOUT reply…');
        const res = await fetch(`/api/admin/quote-requests/${row.id}/internet-scout-poll`, {
          method: 'POST',
        });
        const data = (await res.json()) as {
          ok?: boolean;
          status?: string;
          error?: string;
          mailbox?: string;
          mailboxSource?: string;
          subject?: string;
          internetQuote?: InternetQuoteSnapshot;
          searchErrors?: string[];
        };
        if (cancelled) return;
        if (!res.ok) {
          setAutoPollStatus(data.error ?? 'Mailbox check failed — will retry');
          return;
        }
        if ((data.status === 'ingested' || data.status === 'already_advanced') && data.internetQuote) {
          onDraftChange({
            serviceTypeId: 'internet',
            serviceLabel: 'Internet / Broadband',
            quotePath: 'manual',
            ...draft,
            internetQuote: data.internetQuote,
          });
          setAutoPollStatus('');
          if (data.status === 'ingested') {
            setNotice(
              data.subject
                ? `SCOUT response recorded (${data.subject}). Upload pricing PDFs for quotable providers.`
                : 'SCOUT response recorded. Upload pricing PDFs for quotable providers.',
            );
          }
          onReload?.();
          return;
        }
        if (data.status === 'no_mailbox' || data.status === 'needs_reconnect') {
          setAutoPollStatus(data.error ?? 'No Zoho mailbox connected');
          return;
        }
        const box = data.mailbox ? ` via ${data.mailbox}` : '';
        const errHint = data.searchErrors?.length ? ` (${data.searchErrors[0]})` : '';
        setAutoPollStatus(`Waiting for SCOUT reply${box}…${errHint}`);
      } catch (err) {
        if (!cancelled) {
          setAutoPollStatus(err instanceof Error ? err.message : 'Mailbox check failed — will retry');
        }
      } finally {
        pollInFlight.current = false;
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // draft/onDraftChange/onReload intentionally omitted — poll reads latest via closure on each tick restart only when stage changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internet.workflowStage, disabled, row.id]);

  const uploadPricingPdf = async (file: File, supplierName: string) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('supplierName', supplierName);
      form.append('serviceAddress', internet.requirements.serviceAddress);
      form.append('quoteRequestId', row.id);
      const res = await fetch('/api/admin/internet-quote/parse-pricing-pdf', {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as { option?: InternetQuoteSnapshot['pricingOptions'][0]; error?: string };
      if (!res.ok || !data.option) throw new Error(data.error ?? 'Parse failed');
      const merged = applyMatchScores(
        [...internet.pricingOptions, data.option],
        internet.requirements,
      );
      updateInternet({
        pricingOptions: merged,
        workflowStage: 'pricing_review',
      });
      setNotice(`Parsed pricing for ${supplierName}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'PDF parse failed');
    } finally {
      setBusy(false);
    }
  };

  const scoutAccepted = Boolean(row.customer_accepted_at);
  const serviceAddress = internet.requirements.serviceAddress;

  return (
    <div className="internet-quote-builder">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Internet quote requirements</div>
          <span style={{ fontSize: 12, color: 'var(--gray)' }}>
            Stage: {internet.workflowStage.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="card-body">
          <InternetQuoteRequirementsFields
            value={internet.requirements}
            disabled={disabled}
            onChange={onRequirementsChange}
            onBillUpload={async (file) => {
              setBusy(true);
              try {
                const form = new FormData();
                form.append('file', file);
                const res = await fetch('/api/portal/quote-bill', { method: 'POST', body: form });
                const json = (await res.json()) as {
                  filename?: string;
                  storagePath?: string;
                  error?: string;
                };
                if (!res.ok || !json.storagePath) throw new Error(json.error ?? 'Upload failed');
                onRequirementsChange({
                  ...internet.requirements,
                  billFilename: json.filename,
                  billStoragePath: json.storagePath,
                });
                setNotice('Bill uploaded — run analysis from Action Center if needed.');
              } finally {
                setBusy(false);
              }
            }}
            billUploading={busy}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">SCOUT quote request</div>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.55 }}>
            Internet quotes are requested through SCOUT. We email scout@sandlerpartners.com; the
            automated reply (subject <strong>SCOUT Lookup — address</strong>) advances this workflow.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button type="button" className="btn-primary" disabled={disabled || busy} onClick={sendScoutRequest}>
              {internet.workflowStage === 'scout_pending' ? 'Resend request' : 'Send quote request'}
            </button>
            {internet.workflowStage === 'scout_pending' ? (
              <span className="text-muted" style={{ fontSize: 13 }}>
                {autoPollStatus || 'Waiting for supplier response…'}
              </span>
            ) : null}
          </div>
          {internet.workflowStage === 'scout_pending' ? (
            <div
              style={{
                marginTop: 14,
                padding: '12px 14px',
                borderRadius: 8,
                background: 'var(--surface-muted, #f5f5f5)',
                border: '1px solid var(--gray-border, #e2e2e2)',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Request sent{internet.scoutRequestSentAt ? ` at ${new Date(internet.scoutRequestSentAt).toLocaleString()}` : ''}.
              Checking the shared Zoho mailbox for a SCOUT Lookup reply every 15s and parsing it automatically. Fallback:{' '}
              <button
                type="button"
                className="btn-link"
                style={{ fontSize: 13, padding: 0 }}
                onClick={() => setShowIngest((v) => !v)}
              >
                paste manually
              </button>
              .
            </div>
          ) : null}
          {showIngest ? (
            <div style={{ marginTop: 14 }}>
              <textarea
                className="form-input"
                rows={8}
                placeholder="Paste HTML body from supplier response email…"
                value={ingestHtml}
                onChange={(e) => setIngestHtml(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: 8 }}
                disabled={busy}
                onClick={() => void ingestScoutResponse()}
              >
                Parse &amp; save serviceability
              </button>
            </div>
          ) : null}
          {internet.scoutLookup ? (
            <div style={{ marginTop: 16 }}>
              <strong>Serviceability summary</strong>
              <p style={{ fontSize: 13 }}>{internet.scoutLookup.serviceAddress}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginTop: 10 }}>
                {internet.scoutLookup.providerCards.map((card) => (
                  <div
                    key={card.id}
                    className={[
                      'internet-scout-provider-card',
                      card.quotable ? 'internet-scout-provider-card--quotable' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="internet-scout-provider-card-header">
                      {card.logoUrl ? (
                        <img
                          src={card.logoUrl}
                          alt={card.providerName}
                          className="internet-scout-provider-logo"
                        />
                      ) : null}
                      <div>
                        <div className="internet-scout-provider-name">{card.providerName}</div>
                        {card.roleLabel && card.roleLabel !== card.providerName ? (
                          <div className="internet-scout-provider-role">{card.roleLabel}</div>
                        ) : null}
                      </div>
                    </div>
                    {card.lines.length === 0 ? (
                      <p className="internet-scout-provider-empty">No serviceability details parsed for this provider.</p>
                    ) : (
                      card.lines.map((line) => (
                        <div key={`${card.id}-${line.label}`} className="internet-scout-serviceability-line">
                          <div className="internet-scout-serviceability-line-top">
                            <strong>{line.label}</strong>
                            <span
                              className={`internet-scout-status internet-scout-status--${line.statusColor ?? 'other'}`}
                            >
                              {line.statusText}
                            </span>
                          </div>
                          {line.description ? (
                            <p className="internet-scout-serviceability-desc">{line.description}</p>
                          ) : null}
                        </div>
                      ))
                    )}
                    {card.quotable ? (
                      <label className="internet-scout-upload-label">
                        Upload {card.providerName} pricing PDF
                        <input
                          type="file"
                          accept=".pdf"
                          disabled={busy}
                          className="form-input"
                          style={{ display: 'block', marginTop: 4 }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void uploadPricingPdf(f, card.providerName);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                ))}
              </div>
              {!internet.scoutLookup.providerCards.some((c) => c.quotable) ? (
                <div
                  style={{
                    marginTop: 14,
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--amber, #d4a017)',
                    background: 'rgba(212, 160, 23, 0.08)',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  No available options for the selected internet type(s) at this location. Try a different
                  service type (Broadband, Coax Cable, Fiber, Cellular, or Satellite) in Requirements above,
                  then send a new quote request.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {internet.pricingOptions.length > 0 ? (
        <InternetPricingOptionsPanel
          options={internet.pricingOptions}
          disabled={disabled}
          onChange={(pricingOptions) =>
            updateInternet({ pricingOptions, workflowStage: 'pricing_review' })
          }
        />
      ) : null}

      {scoutAccepted && serviceAddress ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Internet contract (SCOUT portal)</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <a
              className="btn-primary"
              href={scoutPortalContractUrl(serviceAddress)}
              target="_blank"
              rel="noreferrer"
            >
              Create contract in SCOUT
            </a>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await patchQuoteRequest(row.id, {
                  draftQuoteSnapshot: {
                    ...(draft ?? {
                      serviceTypeId: 'internet',
                      serviceLabel: 'Internet / Broadband',
                      quotePath: 'manual',
                    }),
                    internetQuote: {
                      ...internet,
                      scoutContractCustomerNotifiedAt: new Date().toISOString(),
                    },
                  },
                });
                setNotice('Marked submitted — notify the customer they should receive the contract email.');
                setBusy(false);
              }}
            >
              Submitted to customer
            </button>
          </div>
        </div>
      ) : null}

      {notice ? <p style={{ fontSize: 13, color: 'var(--gray-dark)' }}>{notice}</p> : null}
    </div>
  );
}
