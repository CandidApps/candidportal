'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ContractSubmitActionRow } from '@/lib/services/contract-submit-actions';
import {
  buildContractSubmitEmailBody,
  buildContractSubmitEmailSubject,
} from '@/lib/quotes/contract-submit-email';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';
import type {
  ContractSupplierContactOption,
  PaysourceOption,
} from '@/lib/quotes/contract-supplier-options';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import type { QuotePackageSummary } from '@/lib/quotes/quote-package-summary';
import { AcceptedQuotePackageDetails } from '@/components/admin/AcceptedQuotePackageDetails';

type SubmitContractToSupplierModalProps = {
  action: ContractSubmitActionRow;
  onClose: () => void;
  onQueued?: () => void;
};

export function SubmitContractToSupplierModal({
  action,
  onClose,
  onQueued,
}: SubmitContractToSupplierModalProps) {
  const vendorHint = action.vendor_name?.trim() || action.service_label;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<ContractSupplierContactOption[]>([]);
  const [paysources, setPaysources] = useState<PaysourceOption[]>([]);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [paySource, setPaySource] = useState(action.pay_source ?? '');
  const [ccOverride, setCcOverride] = useState('');
  const [publishedSnapshot, setPublishedSnapshot] = useState<PublishedAnalysisSnapshot | null>(
    null,
  );
  const [quotePackage, setQuotePackage] = useState<QuotePackageSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `/api/admin/contract-submit-actions/supplier-options?vendor=${encodeURIComponent(vendorHint)}&actionId=${encodeURIComponent(action.id)}`,
        );
        const data = (await res.json()) as {
          contacts?: ContractSupplierContactOption[];
          paysources?: PaysourceOption[];
          providers?: { id: string; name: string }[];
          publishedSnapshot?: PublishedAnalysisSnapshot | null;
          quotePackage?: QuotePackageSummary | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? 'Failed to load supplier contacts');
        if (cancelled) return;
        setContacts(data.contacts ?? []);
        setPaysources(data.paysources ?? []);
        setProviders(data.providers ?? []);
        setPublishedSnapshot(data.publishedSnapshot ?? null);
        setQuotePackage(data.quotePackage ?? null);
        const primary = (data.contacts ?? []).find((c) => c.isPrimary) ?? data.contacts?.[0];
        if (primary) {
          setSelectedKeys(new Set([`${primary.providerId}:${primary.contactId}`]));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorHint, action.id]);

  const selectedPaysource = useMemo(
    () => paysources.find((p) => p.name === paySource) ?? null,
    [paysources, paySource],
  );

  const ccEmail = ccOverride.trim() || selectedPaysource?.contactEmail || '';

  const selectedContacts = useMemo(
    () => contacts.filter((c) => selectedKeys.has(`${c.providerId}:${c.contactId}`)),
    [contacts, selectedKeys],
  );

  const toggle = (c: ContractSupplierContactOption) => {
    const key = `${c.providerId}:${c.contactId}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openCompose = () => {
    if (!selectedContacts.length) {
      setError('Select at least one supplier contact');
      return;
    }
    const primary = selectedContacts[0]!;
    const to = selectedContacts.map((c) => c.contactEmail).join(', ');
    const enrichedAction: ContractSubmitActionRow = {
      ...action,
      vendor_name: primary.providerName || action.vendor_name,
      acceptance: quotePackage
        ? {
            ...(action.acceptance ?? {
              acceptedAt: action.created_at,
              details: action.details,
              contactName: action.customer_name,
              contactEmail: action.customer_email,
              contactPhone: null,
              serviceLabel: action.service_label,
              monthlyTotal: quotePackage.monthlyTotal,
              setupTotal: quotePackage.setupTotal,
              annualSavings: quotePackage.annualSavings,
              monthlySavings: quotePackage.monthlySavings,
              lines: null,
              ticketId: action.id,
            }),
            monthlyTotal: quotePackage.monthlyTotal,
            setupTotal: quotePackage.setupTotal,
            annualSavings: quotePackage.annualSavings,
            monthlySavings: quotePackage.monthlySavings,
            lines: action.acceptance?.lines ?? publishedSnapshot?.ucaasQuote?.lines ?? null,
          }
        : action.acceptance,
    };
    const subject = buildContractSubmitEmailSubject(enrichedAction);
    const body = buildContractSubmitEmailBody(enrichedAction, {
      paySource: paySource || null,
      includePaysourceCcNote: Boolean(ccEmail),
      snapshot: publishedSnapshot,
    });

    launchAdminZohoCompose({
      to,
      cc: ccEmail || undefined,
      subject,
      body,
      contextLabel: `${primary.providerName} — contract request`,
      contractSubmitActionId: action.id,
      contractSubmitIntent: 'supplier',
      paySource: paySource || undefined,
      paysourcePartnerId: selectedPaysource?.partnerId || undefined,
      providerId: primary.providerId,
      vendorName: primary.providerName,
      // Seed with selected contacts; compose Send overwrites with the final To field.
      supplierContactEmail: to,
    });
    onQueued?.();
    onClose();
  };

  return (
    <div className="modal-overlay open" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-contract-supplier-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640 }}
      >
        <div className="modal-header">
          <h3 id="submit-contract-supplier-title">Submit to supplier</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--gray)' }}>
            Email the accepted quote package to the supplier contacts for{' '}
            <strong>{vendorHint}</strong>. Optionally CC the pay source so they receive the signed
            contract later.
          </p>

          {quotePackage ? (
            <div
              style={{
                border: '1px solid var(--gray-border)',
                borderRadius: 8,
                padding: 12,
                background: 'var(--surface-muted, #f8fafc)',
              }}
            >
              <div className="ticket-detail-field-label" style={{ marginBottom: 8 }}>
                Accepted quote package
              </div>
              <AcceptedQuotePackageDetails pkg={quotePackage} />
            </div>
          ) : null}

          {loading ? <p style={{ color: 'var(--gray)' }}>Loading contacts…</p> : null}
          {error ? <p className="form-error">{error}</p> : null}

          {!loading && !contacts.length ? (
            <p style={{ fontSize: 13, color: 'var(--amber, #b45309)' }}>
              No contacts found for “{vendorHint}”.
              {providers.length
                ? ` Matched providers: ${providers.map((p) => p.name).join(', ')} — add contacts on the supplier record.`
                : ' Add this supplier under Solution Providers with contact emails.'}
            </p>
          ) : null}

          {contacts.length > 0 ? (
            <div>
              <div className="ticket-detail-field-label">Supplier contacts</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                {contacts.map((c) => {
                  const key = `${c.providerId}:${c.contactId}`;
                  const checked = selectedKeys.has(key);
                  return (
                    <label
                      key={key}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        padding: '10px 12px',
                        border: `1px solid ${checked ? 'rgba(99,102,241,0.4)' : 'var(--gray-border)'}`,
                        borderRadius: 8,
                        background: checked ? 'rgba(99,102,241,0.06)' : 'var(--surface)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c)}
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        <strong style={{ fontSize: 13 }}>{c.contactName}</strong>
                        {c.isPrimary ? (
                          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--gray)' }}>
                            PRIMARY
                          </span>
                        ) : null}
                        <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                          {c.providerName}
                          {c.role ? ` · ${c.role}` : ''} · {c.contactEmail}
                        </div>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div>
            <label className="ticket-detail-field-label" htmlFor="contract-pay-source">
              Pay source
            </label>
            <select
              id="contract-pay-source"
              value={paySource}
              onChange={(e) => setPaySource(e.target.value)}
              style={{
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--gray-border)',
                background: 'var(--surface)',
              }}
            >
              <option value="">Select pay source…</option>
              {paysources.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                  {p.contactEmail ? ` (${p.contactEmail})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ticket-detail-field-label" htmlFor="contract-cc">
              CC (pay source)
            </label>
            <input
              id="contract-cc"
              value={ccOverride || selectedPaysource?.contactEmail || ''}
              onChange={(e) => setCcOverride(e.target.value)}
              placeholder="paysource@example.com"
              style={{
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--gray-border)',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>
              Saved on this deal and included on the contract request email.
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="admin-ticket-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-ticket-btn primary"
            disabled={loading || !selectedContacts.length}
            onClick={openCompose}
          >
            Open email
          </button>
        </div>
      </div>
    </div>
  );
}
