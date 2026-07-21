'use client';

import { AddressAutocompleteInput } from '@/components/shared/AddressAutocompleteInput';
import {
  INTERNET_ADDITIONAL_NEEDS_OPTIONS,
  INTERNET_CONNECTION_TYPE_OPTIONS,
  formatServiceAddress,
} from '@/lib/internet/internet-quote-config';
import type {
  InternetAdditionalNeedId,
  InternetConnectionTypeId,
} from '@/lib/internet/internet-quote-config';
import type { InternetQuoteRequirements } from '@/lib/internet/internet-quote-types';

function emptyRequirements(): InternetQuoteRequirements {
  return {
    serviceAddress: '',
    connectionTypes: [],
    additionalNeeds: [],
    desiredSpeed: '',
  };
}

export function InternetQuoteRequirementsFields({
  value,
  onChange,
  disabled = false,
  showBillUpload = true,
  onBillUpload,
  billUploading = false,
  variant = 'admin',
}: {
  value: InternetQuoteRequirements;
  onChange: (next: InternetQuoteRequirements) => void;
  disabled?: boolean;
  showBillUpload?: boolean;
  onBillUpload?: (file: File) => void | Promise<void>;
  billUploading?: boolean;
  /** Admin quote panel vs member new-quote modal. */
  variant?: 'admin' | 'member';
}) {
  const safe = { ...emptyRequirements(), ...value };
  const connectionTypes = safe.connectionTypes ?? [];
  const additionalNeeds = safe.additionalNeeds ?? [];

  const fieldClass = variant === 'member' ? 'nq-field' : 'form-group';
  const labelClass = variant === 'member' ? 'nq-label' : 'form-label';
  const inputClass = variant === 'member' ? 'nq-input' : 'form-input';

  const patch = (partial: Partial<InternetQuoteRequirements>) => {
    const next = { ...safe, ...partial };
    next.serviceAddress =
      partial.serviceAddress ??
      formatServiceAddress({
        street: next.street,
        city: next.city,
        state: next.state,
        zip: next.zip,
      });
    onChange(next);
  };

  const toggleType = (id: InternetConnectionTypeId) => {
    const set = new Set(connectionTypes);
    if (set.has(id)) set.delete(id);
    else {
      if (set.size >= 2) return;
      set.add(id);
    }
    patch({ connectionTypes: [...set] });
  };

  const toggleNeed = (id: InternetAdditionalNeedId) => {
    const set = new Set(additionalNeeds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    patch({ additionalNeeds: [...set] });
  };

  return (
    <div className={`internet-quote-requirements internet-quote-requirements--${variant}`}>
      <label className={fieldClass}>
        <span className={labelClass}>Service address *</span>
        <AddressAutocompleteInput
          value={safe.street ?? ''}
          className={inputClass}
          placeholder="Street address for internet service"
          onChange={(street) => patch({ street })}
          onAddressSelected={(address) =>
            patch({
              street: address.street,
              city: address.city || safe.city,
              state: address.state || safe.state,
              zip: address.zip || safe.zip,
            })
          }
        />
      </label>
      <div className="internet-quote-requirements-location-grid">
        <label className={fieldClass}>
          <span className={labelClass}>City</span>
          <input
            className={inputClass}
            disabled={disabled}
            value={safe.city ?? ''}
            onChange={(e) => patch({ city: e.target.value })}
          />
        </label>
        <label className={fieldClass}>
          <span className={labelClass}>State</span>
          <input
            className={inputClass}
            disabled={disabled}
            value={safe.state ?? ''}
            onChange={(e) => patch({ state: e.target.value })}
          />
        </label>
        <label className={fieldClass}>
          <span className={labelClass}>ZIP</span>
          <input
            className={inputClass}
            disabled={disabled}
            value={safe.zip ?? ''}
            onChange={(e) => patch({ zip: e.target.value })}
          />
        </label>
      </div>
      <p className="internet-quote-requirements-formatted">
        Formatted: {safe.serviceAddress || formatServiceAddress(safe) || '—'}
      </p>

      <div className={fieldClass}>
        <span className={labelClass}>Desired internet type (choose up to 2) *</span>
        <div className="internet-quote-checklist">
          {INTERNET_CONNECTION_TYPE_OPTIONS.map((opt) => {
            const checked = connectionTypes.includes(opt.id);
            const atMax = connectionTypes.length >= 2 && !checked;
            return (
              <label
                key={opt.id}
                className={[
                  'internet-quote-checklist-item',
                  atMax ? 'internet-quote-checklist-item--disabled' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || atMax}
                  onChange={() => toggleType(opt.id)}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className={fieldClass}>
        <span className={labelClass}>Additional needs</span>
        <div className="internet-quote-checklist internet-quote-checklist--row">
          {INTERNET_ADDITIONAL_NEEDS_OPTIONS.map((opt) => (
            <label key={opt.id} className="internet-quote-checklist-item">
              <input
                type="checkbox"
                checked={additionalNeeds.includes(opt.id)}
                disabled={disabled}
                onChange={() => toggleNeed(opt.id)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <label className={fieldClass}>
        <span className={labelClass}>Desired speed *</span>
        <input
          className={inputClass}
          disabled={disabled}
          placeholder="e.g. 500 Mbps symmetric, 1 Gbps download"
          value={safe.desiredSpeed ?? ''}
          onChange={(e) => patch({ desiredSpeed: e.target.value })}
        />
      </label>

      {showBillUpload && onBillUpload ? (
        <div className={fieldClass}>
          <span className={labelClass}>Current provider statement (optional)</span>
          <p className="internet-quote-requirements-hint">
            Upload a recent bill to help us quote accurately — or skip and continue.
          </p>
          {safe.billFilename ? (
            <div className="internet-quote-requirements-attached">
              Attached: <strong>{safe.billFilename}</strong>
            </div>
          ) : null}
          <input
            type="file"
            className={inputClass}
            accept=".pdf,image/*"
            disabled={disabled || billUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onBillUpload(file);
              e.target.value = '';
            }}
          />
          {billUploading ? <p className="text-muted">Uploading…</p> : null}
        </div>
      ) : null}
    </div>
  );
}
