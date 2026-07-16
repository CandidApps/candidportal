'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { Contact, Customer } from '@/components/CustomersView';
import type { Lead } from '@/components/LeadsView';
import type { AssistantEmailItem } from '@/lib/assistant/types';
import { participantsFromEmail } from '@/lib/assistant/email-participants';
import {
  accountsToSmartSyncTargets,
  downloadEmailAttachmentAsFile,
  fetchEmailAttachments,
  filterSmartSyncTargets,
  findSuggestedSmartSyncTarget,
  leadsToSmartSyncTargets,
  runEmailSmartSync,
  searchSmartSyncTargets,
  SMART_SYNC_TYPE_LABEL,
  uploadLeadDocument,
  type EmailAttachmentInfo,
  type SmartSyncTarget,
  type SmartSyncTargetType,
} from '@/lib/assistant/email-smart-sync';
import { EmailAttachmentsPanel } from '@/components/admin/EmailAttachmentsPanel';
import { RECORD_KIND_OPTIONS, type RecordKind } from '@/lib/customer-records';
import { findCustomerByContactEmail } from '@/lib/crm/customer-lookup';
import { createCrmCustomerAccount, saveCrmRecord } from '@/lib/crm/client-persist';
import { saveManualPortalLead } from '@/lib/services/portal-leads';
import { createPartnerSupplier } from '@/lib/services/bank-deposits';
import { commissionSourceKey } from '@/lib/commission-partners';
import { uploadRegistryDocument } from '@/lib/registry-documents';
import {
  COMMISSION_PARTNER_DOCUMENT_OPTIONS,
  guessRegistryDocumentType,
  type CommissionPartnerDocumentType,
} from '@/lib/registry-documents-types';
import { parseContractDocumentFromFile } from '@/lib/contract-document-extract';
import {
  applyContractExtractToForm,
  buildCandidContractRecord,
  CandidContractDealFields,
  emptyCandidContractForm,
  type CandidContractFormState,
} from '@/components/customers/CandidContractDealFields';

type Step = 'search' | 'import';
type CreateType = SmartSyncTargetType;

function newLocalId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function EmailSmartSyncModal({
  item,
  mailbox,
  customers,
  leads = [],
  onClose,
  onOpenCustomer,
  onOpenLead,
}: {
  item: AssistantEmailItem;
  mailbox: string;
  customers: Customer[];
  leads?: Lead[];
  onClose: () => void;
  onOpenCustomer?: (customerId: string) => void;
  onOpenLead?: (leadId: string) => void;
}) {
  const participants = useMemo(
    () => participantsFromEmail(item, mailbox),
    [item, mailbox],
  );

  const localCatalog = useMemo(
    () => [...accountsToSmartSyncTargets(customers), ...leadsToSmartSyncTargets(leads)],
    [customers, leads],
  );

  const suggestedCustomer = useMemo(() => {
    for (const p of participants) {
      const c = findCustomerByContactEmail(customers, p.email);
      if (c) return c;
    }
    return null;
  }, [participants, customers]);

  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [supplierTargets, setSupplierTargets] = useState<SmartSyncTarget[]>([]);
  const [selected, setSelected] = useState<SmartSyncTarget | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<CreateType>('account');
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState(participants[0]?.email ?? '');
  const [createContactName, setCreateContactName] = useState(participants[0]?.name ?? '');

  const [importEmail, setImportEmail] = useState(true);
  const [selectedPeople, setSelectedPeople] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of participants) init[p.email.toLowerCase()] = true;
    return init;
  });
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentsMeta, setAttachmentsMeta] = useState<EmailAttachmentInfo[]>([]);
  const [accountDocKinds, setAccountDocKinds] = useState<Record<string, RecordKind>>({});
  const [partnerDocKinds, setPartnerDocKinds] = useState<
    Record<string, CommissionPartnerDocumentType>
  >({});
  const [contractForm, setContractForm] = useState<CandidContractFormState>(() =>
    emptyCandidContractForm(''),
  );
  const [contractAttachmentId, setContractAttachmentId] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const suggested = findSuggestedSmartSyncTarget(
      localCatalog,
      participants.map((p) => p.email),
    );
    if (suggested && !selected) {
      // soft suggest only — user still picks
    }
  }, [localCatalog, participants, selected]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchSmartSyncTargets(query, 'supplier')
        .then((list) => {
          if (!cancelled) setSupplierTargets(list.filter((t) => t.type === 'supplier'));
        })
        .catch(() => {
          if (!cancelled) setSupplierTargets([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    void fetchEmailAttachments(item.id, item.folderId)
      .then(setAttachmentsMeta)
      .catch(() => setAttachmentsMeta([]));
  }, [item.id, item.folderId]);

  const targets = useMemo(() => {
    return filterSmartSyncTargets([...localCatalog, ...supplierTargets], query, {
      type: 'all',
      limit: 40,
      browseWhenEmpty: true,
    });
  }, [localCatalog, supplierTargets, query]);

  const suggestedId = useMemo(() => {
    if (suggestedCustomer) return suggestedCustomer.id;
    return (
      findSuggestedSmartSyncTarget(
        localCatalog,
        participants.map((p) => p.email),
      )?.id ?? null
    );
  }, [suggestedCustomer, localCatalog, participants]);

  const pickTarget = (t: SmartSyncTarget) => {
    setSelected(t);
    setShowCreate(false);
    setStep('import');
    setError(null);
    setSuccess(null);
  };

  const createAndSelect = async () => {
    const name = createName.trim();
    if (!name) {
      setError('Name is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (createType === 'account') {
        const id = newLocalId('cust');
        const contact: Contact | null =
          createEmail.trim() || createContactName.trim()
            ? {
                id: newLocalId('ct'),
                name: createContactName.trim() || createEmail.trim(),
                email: createEmail.trim(),
                phone: '',
                role: '',
                isPrimary: true,
              }
            : null;
        const customer: Customer = {
          id,
          company: name,
          status: 'prospect',
          agent: '',
          spend: 0,
          savings: 0,
          contracts: 0,
          files: 0,
          since: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          contacts: contact ? [contact] : [],
          locations: [],
        };
        await createCrmCustomerAccount({ customer });
        pickTarget({ id, label: name, type: 'account', subtitle: 'New account' });
      } else if (createType === 'lead') {
        const result = await saveManualPortalLead({
          id: newLocalId('lead'),
          companyFriendly: name,
          status: 'new',
          createdAt: 'Just now',
          source: 'manual',
          lifecycle: 'open',
          contacts:
            createEmail.trim() || createContactName.trim()
              ? [
                  {
                    id: newLocalId('lc'),
                    name: createContactName.trim() || createEmail.trim(),
                    email: createEmail.trim(),
                    phone: '',
                    role: '',
                    isDecisionMaker: false,
                    isPrimary: true,
                  },
                ]
              : [],
          locations: [],
        });
        if (!result.ok || !result.lead?.portalLeadRowId) {
          throw new Error(result.error || 'Could not create lead');
        }
        pickTarget({
          id: result.lead.portalLeadRowId,
          label: result.lead.companyFriendly,
          type: 'lead',
          subtitle: 'New lead',
        });
      } else {
        const partner = await createPartnerSupplier({
          name,
          displayName: name,
          contactName: createContactName.trim() || null,
          contactEmail: createEmail.trim() || null,
        });
        pickTarget({
          id: String(partner.id),
          label: partner.display_name || partner.name,
          type: 'supplier',
          subtitle: 'New partner',
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create record');
    } finally {
      setBusy(false);
    }
  };

  // When a candid_contract attachment is selected on an account/lead, parse it.
  useEffect(() => {
    if (!selected || step !== 'import') return;
    if (selected.type === 'supplier') return;

    const candidId = attachmentIds.find(
      (id) => (accountDocKinds[id] ?? 'other') === 'candid_contract',
    );
    if (!candidId) {
      setContractAttachmentId(null);
      setParseNote(null);
      return;
    }
    if (contractAttachmentId === candidId) return;

    const meta = attachmentsMeta.find((a) => a.attachmentId === candidId);
    if (!meta) return;

    let cancelled = false;
    setParsing(true);
    setParseNote(null);
    setContractAttachmentId(candidId);
    void (async () => {
      try {
        const file = await downloadEmailAttachmentAsFile({
          messageId: item.id,
          folderId: item.folderId,
          attachmentId: candidId,
          filename: meta.attachmentName,
        });
        const result = await parseContractDocumentFromFile(file);
        if (cancelled) return;
        setContractForm((prev) => applyContractExtractToForm(emptyCandidContractForm(''), result));
        setParseNote(
          result.source === 'ai'
            ? 'Contract fields prefilled from the document — verify before importing.'
            : 'Limited contract hints — edit fields as needed.',
        );
      } catch (e) {
        if (!cancelled) {
          setParseNote(e instanceof Error ? e.message : 'Could not parse contract');
          setContractForm(emptyCandidContractForm(''));
        }
      } finally {
        if (!cancelled) setParsing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selected,
    step,
    attachmentIds,
    accountDocKinds,
    attachmentsMeta,
    contractAttachmentId,
    item.id,
    item.folderId,
  ]);

  const runImport = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const messages: string[] = [];
    try {
      const people = participants.filter((p) => selectedPeople[p.email.toLowerCase()]);

      if (people.length) {
        if (selected.type === 'account') {
          const result = await runEmailSmartSync({
            action: 'add_contacts',
            messageId: item.id,
            folderId: item.folderId,
            customerId: selected.id,
            targetType: 'account',
            participants: people.map((p) => ({ name: p.name, email: p.email, selected: true })),
          });
          if (!result.ok) throw new Error(result.error || 'Could not add contacts');
          messages.push(result.message || 'Contacts added');
        } else if (selected.type === 'lead') {
          const result = await runEmailSmartSync({
            action: 'add_lead_contacts',
            messageId: item.id,
            folderId: item.folderId,
            leadId: selected.id,
            participants: people.map((p) => ({ name: p.name, email: p.email, selected: true })),
          });
          if (!result.ok) throw new Error(result.error || 'Could not add contacts');
          messages.push(result.message || 'Contacts added');
        } else {
          const result = await runEmailSmartSync({
            action: 'add_contacts',
            messageId: item.id,
            folderId: item.folderId,
            supplierId: selected.id,
            targetType: 'supplier',
            participants: people.map((p) => ({ name: p.name, email: p.email, selected: true })),
          });
          if (!result.ok) throw new Error(result.error || 'Could not add contacts');
          messages.push(result.message || 'Partner contact updated');
        }
      }

      if (importEmail) {
        if (selected.type === 'account') {
          const result = await runEmailSmartSync({
            action: 'link_email',
            messageId: item.id,
            folderId: item.folderId,
            subject: item.subject,
            from: item.from,
            to: item.to,
            cc: item.cc,
            summary: item.summary,
            customerId: selected.id,
          });
          if (!result.ok) throw new Error(result.error || 'Could not attach email');
          messages.push(result.message || 'Email attached');
        } else if (selected.type === 'lead') {
          const result = await runEmailSmartSync({
            action: 'link_email_to_lead',
            messageId: item.id,
            folderId: item.folderId,
            subject: item.subject,
            from: item.from,
            to: item.to,
            cc: item.cc,
            summary: item.summary,
            leadId: selected.id,
          });
          if (!result.ok) throw new Error(result.error || 'Could not attach email');
          messages.push(result.message || 'Email attached');
        } else {
          // Partner: store email HTML as a registry "other" document when possible.
          const html = [
            `From: ${item.from || ''}`,
            `To: ${item.to || ''}`,
            `Subject: ${item.subject || ''}`,
            '',
            item.summary || '',
          ].join('\n');
          const file = new File(
            [html],
            `Email — ${(item.subject || 'message').slice(0, 60)}.txt`,
            { type: 'text/plain' },
          );
          await uploadRegistryDocument({
            entityType: 'commission_partner',
            entityKey: commissionSourceKey(selected.label),
            file,
            documentType: 'other',
            uploadedBy: 'MyAssistant',
            notes: `Email thread import · Zoho ${item.id}`,
          });
          messages.push('Email saved to partner documents');
        }
      }

      for (const attachmentId of attachmentIds) {
        const meta = attachmentsMeta.find((a) => a.attachmentId === attachmentId);
        if (!meta) continue;
        const file = await downloadEmailAttachmentAsFile({
          messageId: item.id,
          folderId: item.folderId,
          attachmentId,
          filename: meta.attachmentName,
        });

        if (selected.type === 'account') {
          const kind = accountDocKinds[attachmentId] ?? 'other';
          const docId = newLocalId('doc');
          if (kind === 'candid_contract') {
            const contractId = newLocalId('deal');
            const contract = buildCandidContractRecord(contractForm, {
              id: contractId,
              customerId: selected.id,
              locationId: '',
            });
            await saveCrmRecord({
              customerId: selected.id,
              document: {
                id: docId,
                customerId: selected.id,
                locationId: '',
                filename: meta.attachmentName,
                recordKind: 'candid_contract',
                uploadedBy: 'MyAssistant',
                date: new Date().toISOString().slice(0, 10),
                size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
                contractId,
                description: `Imported from email: ${item.subject || '(no subject)'}`,
              },
              contract,
              file,
            });
            messages.push(`Imported contract deal from ${meta.attachmentName}`);
          } else {
            await saveCrmRecord({
              customerId: selected.id,
              document: {
                id: docId,
                customerId: selected.id,
                locationId: '',
                filename: meta.attachmentName,
                recordKind: kind,
                uploadedBy: 'MyAssistant',
                date: new Date().toISOString().slice(0, 10),
                size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
                description: `Imported from email: ${item.subject || '(no subject)'}`,
              },
              file,
            });
            messages.push(`Imported ${meta.attachmentName}`);
          }
        } else if (selected.type === 'lead') {
          const kind = accountDocKinds[attachmentId] ?? 'other';
          let contract: Record<string, unknown> | undefined;
          if (kind === 'candid_contract') {
            const contractId = newLocalId('deal');
            contract = buildCandidContractRecord(contractForm, {
              id: contractId,
              customerId: selected.id,
              locationId: '',
            }) as unknown as Record<string, unknown>;
          }
          const result = await uploadLeadDocument({
            leadId: selected.id,
            file,
            recordKind: kind,
            description: `Imported from email: ${item.subject || '(no subject)'}`,
            contract,
          });
          if (!result.ok) throw new Error(result.error || 'Lead document upload failed');
          messages.push(`Imported ${meta.attachmentName} to lead`);
        } else {
          const docType =
            partnerDocKinds[attachmentId] ??
            (guessRegistryDocumentType('commission_partner', meta.attachmentName) as CommissionPartnerDocumentType);
          await uploadRegistryDocument({
            entityType: 'commission_partner',
            entityKey: commissionSourceKey(selected.label),
            file,
            documentType: docType,
            uploadedBy: 'MyAssistant',
            notes: `Imported from email: ${item.subject || '(no subject)'}`,
          });
          messages.push(`Imported ${meta.attachmentName} to partner`);
        }
      }

      if (!messages.length) {
        throw new Error('Select at least one contact, the email, or an attachment to import');
      }
      setSuccess(messages.join(' · '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const showContractFields =
    selected &&
    selected.type !== 'supplier' &&
    attachmentIds.some((id) => (accountDocKinds[id] ?? 'other') === 'candid_contract');

  return (
    <div className="modal-overlay open" style={{ zIndex: 1200 }}>
      <div className="modal-box assist-modal assist-smart-sync" role="dialog" aria-label="All records">
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="sync" size={14} /> All records
            <span className="assist-smart-sync-sub">Import from email into CRM</span>
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

          {step === 'search' ? (
            <>
              <p className="assist-smart-sync-blurb">
                Search accounts, leads, and partners — or create one if nothing matches.
              </p>
              <div className="assist-smart-sync-picker">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search accounts, leads, partners…"
                  autoFocus
                />
                <div className="assist-smart-sync-target-list">
                  {targets.map((t) => (
                    <button
                      key={`${t.type}:${t.id}`}
                      type="button"
                      className={`assist-smart-sync-target${suggestedId === t.id ? ' suggested' : ''}`}
                      onClick={() => pickTarget(t)}
                    >
                      <span className="assist-smart-sync-target-main">
                        <strong>{t.label}</strong>
                        {t.subtitle ? <em>{t.subtitle}</em> : null}
                      </span>
                      <span className="assist-smart-sync-module">
                        {SMART_SYNC_TYPE_LABEL[t.type]}
                      </span>
                      {suggestedId === t.id ? (
                        <span className="assist-tag assist-tag--partner">Suggested</span>
                      ) : null}
                    </button>
                  ))}
                  {targets.length === 0 ? (
                    <p className="assist-empty">
                      {query.trim()
                        ? 'No matches. Create a new record below.'
                        : 'No records loaded yet. Create one below.'}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="assist-smart-sync-create">
                <button
                  type="button"
                  className="assist-mini-btn"
                  onClick={() => {
                    setShowCreate((v) => !v);
                    if (!createName && query.trim()) setCreateName(query.trim());
                  }}
                >
                  <AppIcon name="add" size={11} />{' '}
                  {showCreate ? 'Hide create form' : 'Create account / lead / partner'}
                </button>
                {showCreate ? (
                  <div className="assist-smart-sync-create-form">
                    <div className="assist-smart-sync-target-type">
                      {(['account', 'lead', 'supplier'] as CreateType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={createType === t ? 'active' : ''}
                          onClick={() => setCreateType(t)}
                        >
                          {SMART_SYNC_TYPE_LABEL[t]}
                        </button>
                      ))}
                    </div>
                    <label className="assist-field">
                      <span>
                        {createType === 'account'
                          ? 'Company name'
                          : createType === 'lead'
                            ? 'Lead company'
                            : 'Partner name'}
                      </span>
                      <input
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="Required"
                      />
                    </label>
                    <div className="assist-smart-sync-deal-fields">
                      <label className="assist-field">
                        <span>Contact name</span>
                        <input
                          value={createContactName}
                          onChange={(e) => setCreateContactName(e.target.value)}
                        />
                      </label>
                      <label className="assist-field">
                        <span>Contact email</span>
                        <input
                          value={createEmail}
                          onChange={(e) => setCreateEmail(e.target.value)}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="assist-mini-btn primary"
                      disabled={busy}
                      onClick={() => void createAndSelect()}
                    >
                      {busy ? 'Creating…' : `Create ${SMART_SYNC_TYPE_LABEL[createType].toLowerCase()}`}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="assist-smart-sync-selected">
                <AppIcon name="check" size={12} />
                <span>
                  {selected?.label}
                  {selected ? (
                    <em className="assist-smart-sync-module-inline">
                      {SMART_SYNC_TYPE_LABEL[selected.type]}
                    </em>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="assist-mini-btn"
                  onClick={() => {
                    setStep('search');
                    setSelected(null);
                    setSuccess(null);
                    setError(null);
                  }}
                >
                  Change
                </button>
                {selected?.type === 'account' && onOpenCustomer ? (
                  <button
                    type="button"
                    className="assist-mini-btn"
                    onClick={() => onOpenCustomer(selected.id)}
                  >
                    Open
                  </button>
                ) : null}
                {selected?.type === 'lead' && onOpenLead ? (
                  <button
                    type="button"
                    className="assist-mini-btn"
                    onClick={() => onOpenLead(selected.id)}
                  >
                    Open
                  </button>
                ) : null}
              </div>

              <p className="assist-smart-sync-blurb">
                Choose what to import from this email into{' '}
                <strong>{selected?.label}</strong>.
              </p>

              <label className="assist-smart-sync-person">
                <input
                  type="checkbox"
                  checked={importEmail}
                  onChange={(e) => setImportEmail(e.target.checked)}
                />
                <span>
                  <strong>Email message</strong>
                  <em>Save this thread onto the record</em>
                </span>
              </label>

              <div className="assist-smart-sync-people" style={{ marginTop: 12 }}>
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
                          onChange={() =>
                            setSelectedPeople((prev) => ({ ...prev, [key]: !prev[key] }))
                          }
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

              <div style={{ marginTop: 12 }}>
                <div className="assist-smart-sync-label">Attachments</div>
                <EmailAttachmentsPanel
                  messageId={item.id}
                  folderId={item.folderId}
                  hasAttachment={item.hasAttachment}
                  selectable
                  selectedIds={attachmentIds}
                  onChangeSelected={(ids) => {
                    setAttachmentIds(ids);
                    setAccountDocKinds((prev) => {
                      const next = { ...prev };
                      for (const id of ids) {
                        if (!next[id]) next[id] = 'other';
                      }
                      return next;
                    });
                    setPartnerDocKinds((prev) => {
                      const next = { ...prev };
                      for (const id of ids) {
                        if (!next[id]) {
                          const meta = attachmentsMeta.find((a) => a.attachmentId === id);
                          next[id] = guessRegistryDocumentType(
                            'commission_partner',
                            meta?.attachmentName ?? '',
                          ) as CommissionPartnerDocumentType;
                        }
                      }
                      return next;
                    });
                  }}
                />
              </div>

              {attachmentIds.length > 0 && selected?.type !== 'supplier' ? (
                <div className="assist-smart-sync-doc-kinds">
                  <div className="assist-smart-sync-label">Document type</div>
                  {attachmentIds.map((id) => {
                    const meta = attachmentsMeta.find((a) => a.attachmentId === id);
                    return (
                      <label key={id} className="assist-field">
                        <span>{meta?.attachmentName || id}</span>
                        <select
                          value={accountDocKinds[id] ?? 'other'}
                          onChange={(e) => {
                            const kind = e.target.value as RecordKind;
                            setAccountDocKinds((prev) => ({ ...prev, [id]: kind }));
                            if (kind === 'candid_contract') setContractAttachmentId(null);
                          }}
                        >
                          {RECORD_KIND_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {attachmentIds.length > 0 && selected?.type === 'supplier' ? (
                <div className="assist-smart-sync-doc-kinds">
                  <div className="assist-smart-sync-label">Partner document type</div>
                  {attachmentIds.map((id) => {
                    const meta = attachmentsMeta.find((a) => a.attachmentId === id);
                    return (
                      <label key={id} className="assist-field">
                        <span>{meta?.attachmentName || id}</span>
                        <select
                          value={partnerDocKinds[id] ?? 'other'}
                          onChange={(e) =>
                            setPartnerDocKinds((prev) => ({
                              ...prev,
                              [id]: e.target.value as CommissionPartnerDocumentType,
                            }))
                          }
                        >
                          {COMMISSION_PARTNER_DOCUMENT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {showContractFields ? (
                <div className="assist-smart-sync-contract">
                  {parsing ? (
                    <p className="assist-smart-sync-blurb">Parsing contract…</p>
                  ) : null}
                  {parseNote ? <p className="assist-smart-sync-blurb">{parseNote}</p> : null}
                  <CandidContractDealFields
                    value={contractForm}
                    onChange={setContractForm}
                    locations={[]}
                    title="Candid contract / deal details"
                  />
                </div>
              ) : null}
            </>
          )}

          {error ? <div className="assist-form-error">{error}</div> : null}
          {success ? <div className="assist-smart-sync-success">{success}</div> : null}
        </div>

        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose} disabled={busy}>
            {success ? 'Done' : 'Close'}
          </button>
          {step === 'import' && !success ? (
            <button
              type="button"
              className="assist-mini-btn primary"
              disabled={busy || parsing}
              onClick={() => void runImport()}
            >
              <AppIcon name="sync" size={11} /> {busy ? 'Importing…' : 'Import selected'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
