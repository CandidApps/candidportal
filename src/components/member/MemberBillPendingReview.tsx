'use client';

import { useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { BillParseResult } from '@/lib/bill-parse-types';
import { formatCategoriesLabel } from '@/lib/provider-categories';
import {
  buildBillParseFlags,
  buildBillParseLineItems,
  buildBillParseSummaryBullets,
} from '@/lib/bill-parse-display';
import {
  getUcaasPhoneLines,
  normalizePhoneKey,
} from '@/lib/bill-parse-phones';
import { submitBillAnalysisConfirmation } from '@/lib/submit-bill-analysis';
import { MemberBillMeetingScheduler } from '@/components/member/MemberBillMeetingScheduler';

export function MemberBillPendingReview({
  vendorName,
  parseResult,
  categories,
  reviewId,
  userId,
  customerName,
  customerEmail,
  alreadySubmitted,
  onSubmitted,
  onBack,
}: {
  vendorName: string;
  parseResult?: BillParseResult | null;
  categories?: string[] | null;
  reviewId?: string;
  userId?: string;
  customerName?: string;
  customerEmail?: string;
  alreadySubmitted?: boolean;
  onSubmitted?: () => void;
  onBack?: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(Boolean(alreadySubmitted || parseResult?.customerConfirmation));
  const [showScheduler, setShowScheduler] = useState(true);

  const categoryLabel = categories?.length
    ? formatCategoriesLabel(categories)
    : parseResult?.categoryLabel ?? formatCategoriesLabel([parseResult?.category ?? 'other']);

  const lineItems = parseResult ? buildBillParseLineItems(parseResult, vendorName) : [];
  const flags = parseResult ? buildBillParseFlags(parseResult) : [];
  const summaryBullets = parseResult ? buildBillParseSummaryBullets(parseResult, vendorName) : [];
  const phoneLines = useMemo(() => getUcaasPhoneLines(parseResult), [parseResult]);
  const phoneKeys = useMemo(() => phoneLines.map((line) => normalizePhoneKey(line.number)), [phoneLines]);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(() => new Set(phoneKeys));
  const portAll = phoneLines.length > 0 && selectedPhones.size === phoneLines.length;

  const togglePortAll = (checked: boolean) => {
    setSelectedPhones(checked ? new Set(phoneKeys) : new Set());
  };

  const togglePhone = (key: string, checked: boolean) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const selectedNumbers = phoneLines
        .filter((line) => selectedPhones.has(normalizePhoneKey(line.number)))
        .map((line) => line.number);
      const porting =
        phoneLines.length > 0
          ? {
              portAll: selectedNumbers.length === phoneLines.length,
              selectedNumbers,
            }
          : undefined;

      if (reviewId && userId) {
        await submitBillAnalysisConfirmation(reviewId, { notes, porting }, userId);
      }
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="card bill-detect-card">
        <div className="card-body bill-detect-success">
          <div className="bill-detect-success-icon" aria-hidden>
            <AppIcon name="check" size={36} />
          </div>
          <h3 className="bill-detect-title">
            We&apos;ve received your <span className="bill-detect-vendor">{vendorName}</span> bill.
          </h3>
          <p className="bill-detect-lead">
            A Candid specialist is reviewing it before we show savings numbers. You&apos;ll get a notification in your
            portal when your analysis is ready
            {parseResult?.category || categories?.length ? (
              <>
                {' '}
                (detected: <strong>{categoryLabel}</strong>)
              </>
            ) : null}
            .
          </p>
          <p className="bill-detect-muted">
            Every analysis is verified for accuracy. This usually takes less than 24 hours, but can take up to 72 hours.
          </p>
          {showScheduler && customerEmail ? (
            <div className="bill-detect-meeting-wrap">
              <MemberBillMeetingScheduler
                customerName={customerName ?? 'Customer'}
                customerEmail={customerEmail}
                vendorName={vendorName}
                reviewId={reviewId}
                userId={userId}
                onBooked={() => setShowScheduler(false)}
                onSkip={() => setShowScheduler(false)}
              />
            </div>
          ) : null}
          {onBack ? (
            <button type="button" className="btn-primary bill-detect-submit" onClick={onBack}>
              Continue
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="card bill-detect-card">
      <div className="card-header bill-detect-header">
        <div className="bill-detect-header-icon" aria-hidden>
          <AppIcon name="search" size={22} />
        </div>
        <div>
          <div className="card-title">Here&apos;s what we detected</div>
          <p className="bill-detect-lead" style={{ margin: '6px 0 0' }}>
            We&apos;ve received your <strong>{vendorName}</strong> bill. Please confirm the details below look right, then
            submit any notes for our team.
          </p>
        </div>
      </div>

      <div className="card-body bill-detect-body">
        {summaryBullets.length > 0 && (
          <ul className="bill-detect-bullets">
            {summaryBullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        )}

        {lineItems.length > 0 && (
          <div className="bill-detect-table-wrap">
            <table className="bill-detect-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Detected value</th>
                  <th scope="col">Qty / detail</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((row) => (
                  <tr key={`${row.label}-${row.value}`}>
                    <td>{row.label}</td>
                    <td>{row.value}</td>
                    <td>{row.quantity ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {flags.length > 0 && (
          <div className="bill-detect-flags">
            {flags.map((flag) => (
              <div
                key={flag.question}
                className={`bill-detect-flag${flag.severity === 'high' ? ' bill-detect-flag--high' : ''}`}
              >
                <AppIcon name="warning" size={16} className="bill-detect-flag-icon" />
                <p>{flag.question}</p>
              </div>
            ))}
          </div>
        )}

        {phoneLines.length > 0 && (
          <div className="bill-detect-porting">
            <div className="bill-detect-porting-head">
              <AppIcon name="phone" size={18} className="bill-detect-porting-icon" />
              <div>
                <h4 className="bill-detect-porting-title">Phone numbers on your bill</h4>
                <p className="bill-detect-porting-question">
                  Do you want to port all of these numbers?
                </p>
              </div>
            </div>
            <label className="bill-detect-port-all">
              <input
                type="checkbox"
                checked={portAll}
                onChange={(e) => togglePortAll(e.target.checked)}
              />
              <span>Port all numbers</span>
            </label>
            <ul className="bill-detect-phone-list">
              {phoneLines.map((line) => {
                const key = normalizePhoneKey(line.number);
                return (
                  <li key={key} className="bill-detect-phone-item">
                    <label className="bill-detect-phone-label">
                      <input
                        type="checkbox"
                        checked={selectedPhones.has(key)}
                        onChange={(e) => togglePhone(key, e.target.checked)}
                      />
                      <span className="bill-detect-phone-number">{line.number}</span>
                      {line.isPrimary ? (
                        <span className="bill-detect-phone-badge">Primary</span>
                      ) : null}
                      {line.label ? (
                        <span className="bill-detect-phone-meta">{line.label}</span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="bill-detect-confirm-block">
          <label htmlFor="bill-detect-notes" className="bill-detect-notes-label">
            Notes for our team <span className="bill-detect-optional">(optional)</span>
          </label>
          <p className="bill-detect-notes-hint">
            Flag anything that looks off — unrecognized fees, services you want removed or reduced (lines, seats,
            equipment), something to add, or a specific vendor you want quoted.
          </p>
          <textarea
            id="bill-detect-notes"
            className="bill-detect-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Let us know if you want to remove or reduce anything (lines, seats, equipment, etc.) before we quote you."
          />
        </div>

        {error ? <div className="bill-detect-error">{error}</div> : null}

        <div className="bill-detect-actions">
          <button
            type="button"
            className="btn-primary bill-detect-submit"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Submitting…' : 'Submit to Candid team'}
          </button>
          {onBack ? (
            <button type="button" className="btn-secondary" disabled={submitting} onClick={onBack}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
