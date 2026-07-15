'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import type { Customer } from '@/components/CustomersView';
import type { AssistantEmailItem } from '@/lib/assistant/types';
import {
  participantsFromEmail,
  type EmailParticipant,
} from '@/lib/assistant/email-participants';
import {
  runEmailSmartSync,
  searchSmartSyncTargets,
  type SmartSyncAction,
  type SmartSyncTarget,
  type SmartSyncTargetType,
} from '@/lib/assistant/email-smart-sync';
import { RECORD_KIND_OPTIONS, type RecordKind } from '@/lib/customer-records';
import { findCustomerByContactEmail } from '@/lib/crm/customer-lookup';
import { EmailAttachmentsPanel } from '@/components/admin/EmailAttachmentsPanel';

type SyncKind = 'email' | 'account' | 'contacts' | 'deal' | 'document';

const KIND_OPTIONS: Array<{ id: SyncKind; label: string; icon: AppIconName; blurb: string }> = [
  {
    id: 'email',
    label: 'Email',
    icon: 'email',
    blurb: 'Attach this message to related account records in the portal.',
  },
  {
    id: 'account',
    label: 'Account',
    icon: 'building',
    blurb: 'Jump to a matched CRM account, or choose one to open.',
  },
  {
    id: 'contacts',
    label: 'Contact(s)',
    icon: 'specialist',
    blurb: 'Add people from this thread as contacts on an account or supplier.',
  },
  {
    id: 'deal',
    label: 'Deal',
    icon: 'handshake',
    blurb: 'Import an attachment as a pending deal + contract document.',
  },
  {
    id: 'document',
    label: 'Document',
    icon: 'file',
    blurb: 'Save email attachments onto a CRM account record.',
  },
];

export function EmailSmartSyncModal({
  item,
  mailbox,
  customers,
  onClose,
  onOpenCustomer,
}: {
  item: AssistantEmailItem;
  mailbox: string;
  customers: Customer[];
  onClose: () => void;
  onOpenCustomer?: (customerId: string) => void;
}) {
  const participants = useMemo(
    () => participantsFromEmail(item, mailbox),
    [item, mailbox],
  );

  const suggestedCustomer = useMemo(() => {
    for (const p of participants) {
      const c = findCustomerByContactEmail(customers, p.email);
      if (c) return c;
    }
    return null;
  }, [participants, customers]);

  const [kind, setKind] = useState<SyncKind>('email');
  const [targetType, setTargetType] = useState<SmartSyncTargetType>('account');
  const [customerId, setCustomerId] = useState(suggestedCustomer?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [targets, setTargets] = useState<SmartSyncTarget[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of participants) init[p.email.toLowerCase()] = true;
    return init;
  });
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [recordKind, setRecordKind] = useState<RecordKind>('other');
  const [vendorName, setVendorName] = useState('');
  const [productName, setProductName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (suggestedCustomer?.id && !customerId) setCustomerId(suggestedCustomer.id);
  }, [suggestedCustomer?.id, customerId]);

  useEffect(() => {
    let cancelled = false;
    const q = targetQuery.trim();
    const timer = window.setTimeout(() => {
      void searchSmartSyncTargets(q || (suggestedCustomer?.company ?? ''))
        .then((list) => {
          if (cancelled) return;
          const filtered =
            kind === 'contacts' && targetType === 'supplier'
              ? list.filter((t) => t.type === 'supplier')
              : kind === 'contacts' && targetType === 'account'
                ? list.filter((t) => t.type === 'account')
                : list.filter((t) => t.type === 'account');
          setTargets(filtered);
        })
        .catch(() => {
          if (!cancelled) setTargets([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [targetQuery, kind, targetType, suggestedCustomer?.company]);

  const selectedTargetLabel = useMemo(() => {
    if (kind === 'contacts' && targetType === 'supplier') {
      return targets.find((t) => t.id === supplierId)?.label ?? '';
    }
    if (customerId) {
      return (
        targets.find((t) => t.id === customerId)?.label ||
        customers.find((c) => c.id === customerId)?.company ||
        customerId
      );
    }
    return '';
  }, [kind, targetType, supplierId, customerId, targets, customers]);

  const togglePerson = (email: string) => {
    const key = email.toLowerCase();
    setSelectedPeople((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (kind === 'account') {
        if (!customerId) throw new Error('Choose an account');
        onOpenCustomer?.(customerId);
        setSuccess('Opening account…');
        window.setTimeout(onClose, 500);
        return;
      }

      const action: SmartSyncAction =
        kind === 'email'
          ? 'link_email'
          : kind === 'contacts'
            ? 'add_contacts'
            : kind === 'deal'
              ? 'import_deal'
              : 'import_document';

      const selectedParticipants: EmailParticipant[] = participants.filter(
        (p) => selectedPeople[p.email.toLowerCase()],
      );

      const result = await runEmailSmartSync({
        action,
        messageId: item.id,
        folderId: item.folderId,
        subject: item.subject,
        from: item.from,
        to: item.to,
        cc: item.cc,
        summary: item.summary,
        customerId: customerId || undefined,
        supplierId: supplierId || undefined,
        targetType,
        participants: selectedParticipants.map((p) => ({
          name: p.name,
          email: p.email,
          selected: true,
        })),
        attachmentIds,
        recordKind,
        vendorName: vendorName || undefined,
        productName: productName || undefined,
      });

      if (!result.ok) throw new Error(result.error || 'Sync failed');
      setSuccess(result.message || 'Done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  };

  const primaryLabel =
    kind === 'account'
      ? 'Open account'
      : kind === 'email'
        ? 'Attach email'
        : kind === 'contacts'
          ? 'Add contacts'
          : kind === 'deal'
            ? 'Import as deal'
            : 'Import document';

  return (
    <div className="modal-overlay open" style={{ zIndex: 1200 }}>
      <div className="modal-box assist-modal assist-smart-sync" role="dialog" aria-label="All records">
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="sync" size={14} /> All records
            <span className="assist-smart-sync-sub">Smart sync from email</span>
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>

        <div className="assist-modal-body">
          <div className="assist-smart-sync-emailmeta">
            <strong>{item.subject || '(no subject)'}</strong>
            <span>{item.from}</span>
          </div>

          <div className="assist-smart-sync-kinds">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`assist-smart-sync-kind${kind === opt.id ? ' active' : ''}`}
                onClick={() => {
                  setKind(opt.id);
                  setError(null);
                  setSuccess(null);
                  if (opt.id !== 'contacts') setTargetType('account');
                }}
              >
                <AppIcon name={opt.icon} size={12} />
                {opt.label}
              </button>
            ))}
          </div>
          <p className="assist-smart-sync-blurb">
            {KIND_OPTIONS.find((k) => k.id === kind)?.blurb}
          </p>

          {kind === 'contacts' ? (
            <>
              <div className="assist-smart-sync-target-type">
                <button
                  type="button"
                  className={targetType === 'account' ? 'active' : ''}
                  onClick={() => {
                    setTargetType('account');
                    setSupplierId('');
                  }}
                >
                  Account
                </button>
                <button
                  type="button"
                  className={targetType === 'supplier' ? 'active' : ''}
                  onClick={() => {
                    setTargetType('supplier');
                    setCustomerId('');
                  }}
                >
                  Supplier
                </button>
              </div>
              <div className="assist-smart-sync-people">
                <div className="assist-smart-sync-label">People on this thread</div>
                {participants.length === 0 ? (
                  <p className="assist-empty">No external participants found.</p>
                ) : (
                  participants.map((p) => {
                    const key = p.email.toLowerCase();
                    return (
                      <label key={key} className="assist-smart-sync-person">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedPeople[key])}
                          onChange={() => togglePerson(p.email)}
                        />
                        <span>
                          <strong>{p.name}</strong>
                          <em>{p.email}</em>
                        </span>
                        <span className="assist-smart-sync-role">{p.role}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          ) : null}

          {(kind === 'deal' || kind === 'document') && (
            <EmailAttachmentsPanel
              messageId={item.id}
              folderId={item.folderId}
              hasAttachment={item.hasAttachment}
              selectable
              selectedIds={attachmentIds}
              onChangeSelected={setAttachmentIds}
            />
          )}

          {kind === 'document' ? (
            <label className="assist-field">
              <span>Record type</span>
              <select
                value={recordKind}
                onChange={(e) => setRecordKind(e.target.value as RecordKind)}
              >
                {RECORD_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {kind === 'deal' ? (
            <div className="assist-smart-sync-deal-fields">
              <label className="assist-field">
                <span>Vendor</span>
                <input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="e.g. Dialpad"
                />
              </label>
              <label className="assist-field">
                <span>Product / service</span>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
          ) : null}

          {kind !== 'contacts' || targetType === 'account' ? (
            kind === 'account' ||
            kind === 'email' ||
            kind === 'document' ||
            kind === 'deal' ||
            (kind === 'contacts' && targetType === 'account') ? (
              <TargetPicker
                label={kind === 'account' ? 'Account' : 'CRM account'}
                query={targetQuery}
                onQueryChange={setTargetQuery}
                targets={targets.filter((t) => t.type === 'account')}
                selectedId={customerId}
                selectedLabel={selectedTargetLabel}
                onSelect={(id) => setCustomerId(id)}
                suggestedId={suggestedCustomer?.id}
              />
            ) : null
          ) : (
            <TargetPicker
              label="Supplier"
              query={targetQuery}
              onQueryChange={setTargetQuery}
              targets={targets.filter((t) => t.type === 'supplier')}
              selectedId={supplierId}
              selectedLabel={selectedTargetLabel}
              onSelect={(id) => setSupplierId(id)}
            />
          )}

          {error ? <div className="assist-form-error">{error}</div> : null}
          {success ? <div className="assist-smart-sync-success">{success}</div> : null}
        </div>

        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button
            type="button"
            className="assist-mini-btn primary"
            disabled={busy}
            onClick={() => void run()}
          >
            <AppIcon name="sync" size={11} /> {busy ? 'Working…' : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TargetPicker({
  label,
  query,
  onQueryChange,
  targets,
  selectedId,
  selectedLabel,
  onSelect,
  suggestedId,
}: {
  label: string;
  query: string;
  onQueryChange: (q: string) => void;
  targets: SmartSyncTarget[];
  selectedId: string;
  selectedLabel: string;
  onSelect: (id: string) => void;
  suggestedId?: string;
}) {
  return (
    <div className="assist-smart-sync-picker">
      <div className="assist-smart-sync-label">{label}</div>
      {selectedId ? (
        <div className="assist-smart-sync-selected">
          <AppIcon name="check" size={12} />
          <span>{selectedLabel || selectedId}</span>
          <button type="button" className="assist-mini-btn" onClick={() => onSelect('')}>
            Change
          </button>
        </div>
      ) : null}
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}…`}
      />
      <div className="assist-smart-sync-target-list">
        {targets.slice(0, 12).map((t) => (
          <button
            key={`${t.type}:${t.id}`}
            type="button"
            className={`assist-smart-sync-target${selectedId === t.id ? ' active' : ''}${
              suggestedId === t.id ? ' suggested' : ''
            }`}
            onClick={() => onSelect(t.id)}
          >
            <strong>{t.label}</strong>
            {t.subtitle ? <em>{t.subtitle}</em> : null}
            {suggestedId === t.id ? <span className="assist-tag assist-tag--partner">Suggested</span> : null}
          </button>
        ))}
        {targets.length === 0 ? <p className="assist-empty">No matches. Try another search.</p> : null}
      </div>
    </div>
  );
}
