'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  recordKindLabel,
  recordKindToLegacyFileType,
  type CandidContractRecord,
  type CustomerDocument,
  type DealStatus,
} from '@/lib/customer-records';
import { AddCustomerRecordsModal, type AddCustomerRecordsResult } from '@/components/customers/AddCustomerRecordsModal';
import EditContractModal from '@/components/customers/EditContractModal';
import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import { documentViewUrl, findDocumentForContract } from '@/lib/contract-document-link';
import type { Contact, Customer, Location } from '@/components/CustomersView';
import { CustomerActionsBanner } from '@/components/customers/CustomerActionsBanner';
import { customerDocumentUrl, isCustomerDocumentAvailable } from '@/lib/crm/document-url';
import type { CustomerAction } from '@/lib/portal-import/merge';
import type { ResolvedCustomerAction } from '@/lib/customer-actions-store';
import { formatServiceBreakdownLines } from '@/lib/service-breakdown-display';
import { portalTierLabel } from '@/lib/portal-access';

function formatDocAmount(amount?: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BRAND = {
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  grayDark: '#1E1E1E',
  gray: '#6B6B6B',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  white: '#FFFFFF',
  green: '#1A7A4A',
  amber: '#B45309',
  blue: '#1D4ED8',
} as const;

const PANEL_SCROLL: React.CSSProperties = { maxHeight: 340, overflowY: 'auto', overflowX: 'auto' };

const iconBase = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ChevronLeftIcon = () => (<svg {...iconBase}><polyline points="15 18 9 12 15 6" /></svg>);
const PlusIcon = () => (<svg {...iconBase}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const PhoneIcon = () => (<svg {...iconBase}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>);
const MailIcon = () => (<svg {...iconBase}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>);
const MessageIcon = () => (<svg {...iconBase}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
const MapPinIcon = () => (<svg {...iconBase}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);
const UserIcon = () => (<svg {...iconBase}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
const EditIcon = () => (<svg {...iconBase}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);
const EyeIcon = () => (<svg {...iconBase}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
const LogInIcon = () => (<svg {...iconBase}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>);
const TrashIcon = () => (<svg {...iconBase}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>);
const SearchIcon = () => (<svg {...iconBase}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);

function formatLocation(loc?: Location): string {
  if (!loc) return '—';
  const cityState = [loc.city, loc.state].filter(Boolean).join(', ');
  return [loc.street, cityState, loc.zip].filter(Boolean).join(' · ');
}

function primaryContactFor(c: Customer): Contact | undefined {
  return c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];
}

function primaryLocation(c: Customer): Location | undefined {
  return c.locations.find((x) => x.isPrimary) ?? c.locations[0];
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

function contactsAtLocation(contacts: Contact[], locationId: string, primaryId: string): Contact[] {
  return contacts.filter((ct) => {
    if (!ct.locationIds?.length) return ct.isPrimary && locationId === primaryId;
    return ct.locationIds.includes(locationId);
  });
}

function locationLabel(locations: Location[], id: string): string {
  return locations.find((l) => l.id === id)?.label ?? 'Unknown';
}

const HeaderSearch: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => (
  <div style={{ position: 'relative', minWidth: 200 }}>
    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: BRAND.gray }}><SearchIcon /></span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1px solid ${BRAND.grayBorder}`, borderRadius: 6, fontSize: 12, fontFamily: "'DM Sans',sans-serif", outline: 'none' }}
    />
  </div>
);

const Th: React.FC<{ children: React.ReactNode; center?: boolean; right?: boolean }> = ({ children, center, right }) => (
  <th style={{ padding: '11px 16px', textAlign: center ? 'center' : right ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.gray, position: 'sticky', top: 0, background: BRAND.grayLight, zIndex: 1 }}>
    {children}
  </th>
);

export type CustomerRecordDetailProps = {
  customer: Customer;
  documents: CustomerDocument[];
  contracts: CandidContractRecord[];
  uploadedBy: string;
  onBack: () => void;
  onUpdateCustomer: (patch: Partial<Customer>) => void;
  onUpsertContact: (contact: Contact) => void;
  onRemoveContact: (id: string) => void;
  onUpsertLocation: (location: Location) => void;
  onRemoveLocation: (id: string) => void;
  onDocumentsChange: (docs: CustomerDocument[]) => void;
  onContractsChange: (contracts: CandidContractRecord[]) => void;
  onEditCustomer: () => void;
  onAddContact: () => void;
  onEditContact: (c: Contact) => void;
  onAddLocation: () => void;
  onEditLocation: (l: Location) => void;
  onEditContract: (c: CandidContractRecord) => void;
  onViewAsContact?: (contact: Contact) => void;
  onEditDocument?: (doc: CustomerDocument) => void;
  openActions?: CustomerAction[];
  resolvedActions?: ResolvedCustomerAction[];
  onResolveAction?: (action: CustomerAction) => void;
  onAddCustomAction?: () => void;
};

export function CustomerRecordDetail({
  customer: c,
  documents,
  contracts,
  uploadedBy,
  onUpdateCustomer,
  onUpsertContact,
  onRemoveContact,
  onUpsertLocation,
  onRemoveLocation,
  onDocumentsChange,
  onContractsChange,
  onEditCustomer,
  onAddContact,
  onEditContact,
  onAddLocation,
  onEditLocation,
  onEditContract,
  onViewAsContact,
  onEditDocument,
  openActions = [],
  resolvedActions = [],
  onResolveAction,
  onAddCustomAction,
}: CustomerRecordDetailProps) {
  const primaryLoc = primaryLocation(c);
  const primaryLocId = primaryLoc?.id ?? '';
  const primaryCt = primaryContactFor(c);
  const contactPhone = primaryCt?.phone?.trim() ?? '';
  const contactEmail = primaryCt?.email?.trim() ?? '';
  const telHref = contactPhone ? `tel:${phoneDigits(contactPhone)}` : undefined;
  const mailHref = contactEmail ? `mailto:${contactEmail}` : undefined;
  const smsHref = contactPhone ? `sms:${phoneDigits(contactPhone)}` : undefined;

  const [addRecordsOpen, setAddRecordsOpen] = useState(false);
  const [pendingAddRecord, setPendingAddRecord] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [contractSearch, setContractSearch] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [locContactMenu, setLocContactMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setLocContactMenu(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filteredLocations = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return c.locations;
    return c.locations.filter((l) =>
      [l.label, l.street, l.city, l.state, l.zip].join(' ').toLowerCase().includes(q)
    );
  }, [c.locations, locationSearch]);

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return c.contacts;
    return c.contacts.filter((ct) => {
      const locNames = (ct.locationIds ?? []).map((id) => locationLabel(c.locations, id));
      return [ct.name, ct.role, ct.email, ct.phone, ct.crmNotes, ...locNames]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [c.contacts, c.locations, contactSearch]);

  const locContactsBase = useMemo(() => {
    if (!selectedLocationId) return [];
    return contactsAtLocation(c.contacts, selectedLocationId, primaryLocId);
  }, [selectedLocationId, c.contacts, primaryLocId]);

  const locContactsFiltered = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return locContactsBase;
    return locContactsBase.filter((ct) =>
      [ct.name, ct.role, ct.email, ct.phone].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [locContactsBase, contactSearch]);

  const docSearching = docSearch.trim().length > 0;
  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    let list = documents;
    if (!docSearching && primaryLocId) list = list.filter((d) => d.locationId === primaryLocId);
    if (!q) return list;
    return documents.filter((d) =>
      [
        d.filename,
        recordKindLabel(d.recordKind),
        d.docSubtype,
        d.provider,
        d.roiNote,
        d.description,
        locationLabel(c.locations, d.locationId),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [documents, docSearch, docSearching, primaryLocId, c.locations]);

  const contractSearching = contractSearch.trim().length > 0;
  const showContractLocations = c.locations.length > 1;
  const filteredContracts = useMemo(() => {
    const q = contractSearch.trim().toLowerCase();
    let list = contracts;
    if (!q) return list;
    return contracts.filter((ct) =>
      [
        contractServiceTitle(ct),
        ct.solutionDescription,
        ct.paySource,
        ct.agentOfRecord,
        ct.dealId,
        ct.dealNote,
        ct.salesOrderRef,
        locationLabel(c.locations, ct.locationId),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [contracts, contractSearch, c.locations]);

  useEffect(() => {
    if (!pendingAddRecord || c.locations.length === 0) return;
    setAddRecordsOpen(true);
    setPendingAddRecord(false);
  }, [pendingAddRecord, c.locations.length]);

  const openAddRecords = () => {
    if (c.locations.length === 0) {
      onUpsertLocation({
        id: `loc-${c.id}-primary`,
        label: 'Primary',
        street: '',
        city: '',
        state: '',
        zip: '',
        isPrimary: true,
      });
      setPendingAddRecord(true);
      return;
    }
    setAddRecordsOpen(true);
  };

  const recordLocationId = primaryLocId || c.locations[0]?.id || '';

  const selectedLocation = selectedLocationId ? c.locations.find((l) => l.id === selectedLocationId) : null;

  const handleAddRecord = (result: AddCustomerRecordsResult) => {
    if (result.type === 'document') {
      onDocumentsChange([result.doc, ...documents]);
      onUpdateCustomer({ files: (c.files ?? 0) + 1 });
    } else {
      onDocumentsChange([result.doc, ...documents]);
      onContractsChange([result.contract, ...contracts]);
      onUpdateCustomer({ files: (c.files ?? 0) + 1, contracts: (c.contracts ?? 0) + 1 });
    }
    setAddRecordsOpen(false);
  };

  const contractStatusColor = (s: DealStatus | string) => {
    if (s === 'expiring' || s === 'expired') return BRAND.red;
    if (s === 'active') return BRAND.green;
    return BRAND.gray;
  };

  if (selectedLocation) {
    const locDocs = documents.filter((d) => d.locationId === selectedLocation.id);
    const locContracts = contracts.filter((ct) => ct.locationId === selectedLocation.id);

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button type="button" onClick={() => setSelectedLocationId(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
            <ChevronLeftIcon /> Back to {c.company}
          </button>
        </div>
        <div style={{ background: BRAND.grayDark, borderRadius: 10, padding: '20px 24px', marginBottom: 16, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})` }} />
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: BRAND.redLight, marginBottom: 6 }}>Location</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: BRAND.white }}>{selectedLocation.label}</div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>{formatLocation(selectedLocation)}</div>
        </div>
        <ScrollSection
          title="Contacts"
          subtitle={contactSearch.trim() ? `${locContactsFiltered.length} of ${locContactsBase.length} at this location` : `${locContactsBase.length} at this location`}
          headerRight={<HeaderSearch value={contactSearch} onChange={setContactSearch} placeholder="Search contacts…" />}
        >
          {locContactsFiltered.length === 0 ? (
            <EmptyRow text={contactSearch.trim() ? 'No contacts match your search.' : 'No contacts assigned to this location.'} />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: BRAND.grayLight }}><Th>Name</Th><Th>Email</Th><Th>Phone</Th></tr></thead>
              <tbody>
                {locContactsFiltered.map((ct) => (
                  <tr key={ct.id} style={{ borderBottom: `1px solid ${BRAND.grayBorder}` }}>
                    <td style={{ padding: '10px 16px' }}><button type="button" onClick={() => setSelectedContact(ct)} style={{ background: 'none', border: 'none', color: BRAND.red, fontWeight: 600, cursor: 'pointer', padding: 0 }}>{ct.name}</button></td>
                    <td style={{ padding: '10px 16px' }}>{ct.email ? <a href={`mailto:${ct.email}`} style={{ color: BRAND.blue }}>{ct.email}</a> : '—'}</td>
                    <td style={{ padding: '10px 16px' }}>{ct.phone ? <a href={`tel:${ct.phone.replace(/\D/g, '')}`} style={{ color: BRAND.blue }}>{ct.phone}</a> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollSection>
        <ScrollSection
          title="Active Contracts / Deals"
          subtitle={`${locContracts.length} deal${locContracts.length === 1 ? '' : 's'}`}
          actions={<button type="button" onClick={openAddRecords} style={btnSmall}><PlusIcon /> Add</button>}
        >
          <MiniContractTable contracts={locContracts} documents={documents} locations={c.locations} showLocation={false} onEdit={onEditContract} />
        </ScrollSection>
        <ScrollSection
          title={`Documents (${locDocs.length})`}
          actions={<button type="button" onClick={openAddRecords} style={btnSmall}><PlusIcon /> Add</button>}
        >
          <MiniDocTable docs={locDocs} locations={c.locations} showLocation={false} onEdit={onEditDocument} />
        </ScrollSection>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 'calc(100vh - 100px)' }}>
      <div
        style={{
          background: BRAND.grayLight,
          border: `1px solid ${BRAND.grayBorder}`,
          borderRadius: 10,
          padding: '12px 18px',
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: BRAND.grayDark }}>{c.company}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {telHref ? (
              <a href={telHref} style={{ ...btnSmall, textDecoration: 'none', color: BRAND.grayDark }} title={`Call ${primaryCt?.name ?? 'contact'}`}>
                <PhoneIcon /> Call
              </a>
            ) : (
              <span style={{ ...btnSmall, opacity: 0.45, cursor: 'not-allowed' }} title="No phone on file"><PhoneIcon /> Call</span>
            )}
            {mailHref ? (
              <a href={mailHref} style={{ ...btnSmall, textDecoration: 'none', color: BRAND.grayDark }} title={`Email ${primaryCt?.name ?? 'contact'}`}>
                <MailIcon /> Email
              </a>
            ) : (
              <span style={{ ...btnSmall, opacity: 0.45, cursor: 'not-allowed' }} title="No email on file"><MailIcon /> Email</span>
            )}
            {smsHref ? (
              <a href={smsHref} style={{ ...btnSmall, textDecoration: 'none', color: BRAND.grayDark }} title={`Text ${primaryCt?.name ?? 'contact'}`}>
                <MessageIcon /> SMS
              </a>
            ) : (
              <span style={{ ...btnSmall, opacity: 0.45, cursor: 'not-allowed' }} title="No mobile on file"><MessageIcon /> SMS</span>
            )}
            <button type="button" onClick={onEditCustomer} style={btnSmall}><EditIcon /> Edit</button>
            <button
              type="button"
              onClick={openAddRecords}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`,
                color: BRAND.white,
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <PlusIcon /> Add Record
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
        <CustomerActionsBanner
          actions={openActions}
          resolvedActions={resolvedActions}
          salesPitch={c.portal?.salesPitch?.opening}
          onResolveAction={onResolveAction}
          onAddCustomAction={onAddCustomAction}
        />

        <ScrollSection
          title="Business Information"
          actions={
            <button type="button" onClick={onEditCustomer} style={btnSmall}><EditIcon /> Edit</button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, padding: 16 }}>
            <InfoField label="Legal Name" value={c.companyLegal} />
            <InfoField label="Industry" value={c.industry} />
            <InfoField label="Website" value={c.website ? c.website.replace(/^https?:\/\//, '') : undefined} />
            {c.description && (
              <div style={{ gridColumn: '1 / -1' }}>
                <InfoField label="Description" value={c.description} />
              </div>
            )}
            <InfoField label="Tax ID / EIN" value={c.taxId} />
            <InfoField label="MCC Code" value={c.mccCode} />
            <InfoField label="Corp Type" value={c.corpType} />
            <InfoField label="Primary Address" value={formatLocation(primaryLoc)} />
            <InfoField label="Sales Agent" value={c.agent} />
            <InfoField label="Member Since" value={c.since} />
            {c.portal?.totalCandidMrc != null && c.portal.totalCandidMrc > 0 && (
              <InfoField label="Candid MRC" value={`$${c.portal.totalCandidMrc.toFixed(2)}/mo`} />
            )}
            {c.portal?.billingCycle && (
              <InfoField label="Billing cycle" value={c.portal.billingCycle} />
            )}
            {c.portal?.previousProviderMrc != null && (
              <InfoField label="Previous provider MRC" value={`$${c.portal.previousProviderMrc.toFixed(2)}/mo`} />
            )}
            {c.portal?.savingsVsPrevious != null && c.portal.savingsVsPrevious > 0 && (
              <InfoField label="Savings vs previous" value={`$${c.portal.savingsVsPrevious.toFixed(2)}/mo`} />
            )}
            {c.portal?.previousProvider?.provider && (
              <div style={{ gridColumn: '1 / -1', padding: '12px 14px', background: BRAND.grayLight, borderRadius: 8, border: `1px solid ${BRAND.grayBorder}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 8 }}>
                  Previous provider
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <InfoField label="Provider" value={c.portal.previousProvider.provider} />
                  {c.portal.previousProvider.accountNum && (
                    <InfoField label="Account #" value={c.portal.previousProvider.accountNum} />
                  )}
                  {c.portal.previousProvider.lastInvoiceAmount != null && (
                    <InfoField label="Last invoice" value={formatDocAmount(c.portal.previousProvider.lastInvoiceAmount)} />
                  )}
                  {c.portal.previousProvider.lastInvoiceDate && (
                    <InfoField label="Invoice date" value={c.portal.previousProvider.lastInvoiceDate} />
                  )}
                  {c.portal.previousProvider.product && (
                    <InfoField label="Product" value={c.portal.previousProvider.product} />
                  )}
                </div>
                {c.portal.previousProvider.note && (
                  <div style={{ marginTop: 10, fontSize: 12, color: BRAND.gray, lineHeight: 1.5 }}>
                    {c.portal.previousProvider.note}
                  </div>
                )}
              </div>
            )}
            {(c.portal?.nonCandidServices?.length ?? 0) > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <InfoField
                  label="Non-Candid services"
                  value={c.portal!.nonCandidServices!
                    .map((svc) => `${svc.provider}${svc.product ? ` — ${svc.product}` : ''}${svc.mrc != null ? ` ($${svc.mrc}/mo)` : ''}`)
                    .join(' · ')}
                />
              </div>
            )}
            {c.portal?.financialNotes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <InfoField label="Portfolio notes" value={c.portal.financialNotes} />
              </div>
            )}
            {c.notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <InfoField label="Internal notes" value={c.notes} />
              </div>
            )}
          </div>
        </ScrollSection>

        <ScrollSection
          title="Locations"
          subtitle={`${c.locations.length} addresses`}
          headerRight={<HeaderSearch value={locationSearch} onChange={setLocationSearch} placeholder="Search locations…" />}
          actions={<button type="button" onClick={onAddLocation} style={btnSmall}><PlusIcon /> Add</button>}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: BRAND.grayLight }}>
                <Th>Location</Th><Th>Address</Th><Th center>Primary</Th><Th center>People</Th><Th center>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filteredLocations.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: BRAND.gray }}>No locations match.</td></tr>
              ) : filteredLocations.map((loc) => (
                <tr key={loc.id} style={{ borderBottom: `1px solid ${BRAND.grayBorder}` }}>
                  <td style={{ padding: '12px 16px' }}>
                    <button type="button" onClick={() => setSelectedLocationId(loc.id)} style={{ background: 'none', border: 'none', color: BRAND.red, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>{loc.label}</button>
                  </td>
                  <td style={{ padding: '12px 16px', color: BRAND.gray, fontSize: 12 }}>{formatLocation(loc)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>{loc.isPrimary ? '★' : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ position: 'relative', display: 'inline-block' }} ref={locContactMenu === loc.id ? menuRef : undefined}>
                    <button type="button" title="Location contacts" onClick={() => setLocContactMenu(locContactMenu === loc.id ? null : loc.id)} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${BRAND.grayBorder}`, background: BRAND.white, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <UserIcon />
                    </button>
                    {locContactMenu === loc.id && (
                      <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 200, padding: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: BRAND.gray, padding: '4px 8px', textTransform: 'uppercase' }}>Contacts at {loc.label}</div>
                        {contactsAtLocation(c.contacts, loc.id, primaryLocId).map((ct) => (
                          <div key={ct.id} onClick={() => { setSelectedContact(ct); setLocContactMenu(null); }} style={{ padding: '8px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }} onMouseOver={(e) => (e.currentTarget.style.background = BRAND.grayLight)}>
                            <div style={{ fontWeight: 600 }}>{ct.name}</div>
                            <div style={{ color: BRAND.gray }}>{ct.role || ct.email}</div>
                          </div>
                        ))}
                        {contactsAtLocation(c.contacts, loc.id, primaryLocId).length === 0 && (
                          <div style={{ padding: 8, fontSize: 12, color: BRAND.gray }}>No contacts linked</div>
                        )}
                      </div>
                    )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button type="button" onClick={() => onEditLocation(loc)} style={iconBtn}><EditIcon /></button>
                      <button type="button" onClick={() => { if (confirm('Remove location?')) onRemoveLocation(loc.id); }} style={iconBtn}><TrashIcon /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollSection>

        <ScrollSection
          title="Contacts"
          subtitle={contactSearch.trim() ? `${filteredContacts.length} of ${c.contacts.length} people` : `${c.contacts.length} people`}
          headerRight={<HeaderSearch value={contactSearch} onChange={setContactSearch} placeholder="Search contacts…" />}
          actions={<button type="button" onClick={onAddContact} style={btnSmall}><PlusIcon /> Add</button>}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: BRAND.grayLight }}><Th>Name</Th><Th>Role</Th><Th>Email</Th><Th>Phone</Th><Th center>Actions</Th></tr></thead>
            <tbody>
              {filteredContacts.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: BRAND.gray }}>{contactSearch.trim() ? 'No contacts match your search.' : 'No contacts on file.'}</td></tr>
              ) : filteredContacts.map((ct) => (
                <tr key={ct.id} style={{ borderBottom: `1px solid ${BRAND.grayBorder}` }}>
                  <td style={{ padding: '12px 16px' }}>
                    <button type="button" onClick={() => setSelectedContact(ct)} style={{ background: 'none', border: 'none', color: BRAND.red, fontWeight: 600, cursor: 'pointer', padding: 0 }}>{ct.name}</button>
                    {ct.portalAccess && (
                      <span style={{ display: 'inline-block', marginLeft: 8, fontSize: 10, fontWeight: 700, color: BRAND.green, background: 'rgba(26,122,74,0.1)', border: '1px solid rgba(26,122,74,0.2)', borderRadius: 20, padding: '2px 7px' }}>
                        Portal · {portalTierLabel(ct.portalAccessTier ?? 'trial')}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: BRAND.gray }}>{ct.role || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {ct.email ? <a href={`mailto:${ct.email}`} style={{ color: BRAND.blue, textDecoration: 'none' }}>{ct.email}</a> : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {ct.phone ? <a href={`tel:${ct.phone.replace(/\D/g, '')}`} style={{ color: BRAND.blue, textDecoration: 'none' }}>{ct.phone}</a> : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      {ct.portalAccess && onViewAsContact && (
                        <button
                          type="button"
                          onClick={() => onViewAsContact(ct)}
                          style={iconBtn}
                          title={`View portal as ${ct.name}`}
                        >
                          <LogInIcon />
                        </button>
                      )}
                      <button type="button" onClick={() => onEditContact(ct)} style={iconBtn} title="Edit contact"><EditIcon /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollSection>

        <ScrollSection
          title="Active Contracts / Deals"
          subtitle={
            contractSearching
              ? `${filteredContracts.length} matching`
              : `${contracts.length} deal${contracts.length === 1 ? '' : 's'} across ${c.locations.length || 1} location${c.locations.length === 1 ? '' : 's'}`
          }
          headerRight={<HeaderSearch value={contractSearch} onChange={setContractSearch} placeholder="Search contracts…" />}
          actions={<button type="button" onClick={openAddRecords} style={btnSmall}><PlusIcon /> Add</button>}
        >
          <MiniContractTable
            contracts={filteredContracts}
            documents={documents}
            locations={c.locations}
            showLocation={showContractLocations}
            onEdit={onEditContract}
          />
        </ScrollSection>

        <ScrollSection
          title="Documents"
          subtitle={docSearching ? 'Searching all locations' : `Primary location: ${primaryLoc?.label ?? '—'}`}
          headerRight={<HeaderSearch value={docSearch} onChange={setDocSearch} placeholder="Search documents…" />}
          actions={<button type="button" onClick={openAddRecords} style={btnSmall}><PlusIcon /> Add</button>}
        >
          <MiniDocTable docs={filteredDocs} locations={c.locations} showLocation={docSearching} onEdit={onEditDocument} />
        </ScrollSection>
      </div>

      {addRecordsOpen && recordLocationId && (
        <AddCustomerRecordsModal
          customerId={c.id}
          locations={c.locations}
          defaultLocationId={recordLocationId}
          uploadedBy={uploadedBy}
          onClose={() => setAddRecordsOpen(false)}
          onSave={handleAddRecord}
        />
      )}

      {selectedContact && (
        <ContactDetailModal
          contact={selectedContact}
          company={c.company}
          onClose={() => setSelectedContact(null)}
          onEdit={() => { setSelectedContact(null); onEditContact(selectedContact); }}
          onViewAsContact={onViewAsContact}
        />
      )}
    </div>
  );
}

const btnSmall: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: BRAND.grayLight, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { width: 28, height: 28, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 5, background: BRAND.white, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

function ScrollSection({ title, subtitle, headerRight, actions, children }: { title: string; subtitle?: string; headerRight?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BRAND.grayBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grayDark }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {headerRight}
          {actions}
        </div>
      </div>
      <div style={PANEL_SCROLL}>{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div style={{ padding: 24, textAlign: 'center', color: BRAND.gray, fontSize: 13 }}>{text}</div>;
}

function InfoField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: BRAND.grayDark }}>{value || <span style={{ color: BRAND.gray, fontStyle: 'italic' }}>Not set</span>}</div>
    </div>
  );
}

function MiniDocTable({
  docs,
  locations,
  showLocation,
  onEdit,
}: {
  docs: CustomerDocument[];
  locations: Location[];
  showLocation: boolean;
  onEdit?: (doc: CustomerDocument) => void;
}) {
  if (!docs.length) return <EmptyRow text="No documents." />;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: BRAND.grayLight }}>
          <Th>File</Th><Th>Type</Th><Th>Subtype</Th><Th>Provider</Th>{showLocation && <Th>Location</Th>}<Th>Date</Th><Th right>Amount</Th>
          {onEdit && <Th center>Actions</Th>}
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => {
          const href = isCustomerDocumentAvailable(d) ? customerDocumentUrl(d) : null;
          return (
          <tr key={d.id} style={{ borderBottom: `1px solid ${BRAND.grayBorder}` }}>
            <td style={{ padding: '10px 16px', fontWeight: 500 }}>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: BRAND.red, textDecoration: 'none' }}>
                  {d.filename}
                </a>
              ) : (
                d.filename
              )}
              {d.roiNote ? (
                <div style={{ fontSize: 10, color: BRAND.amber, marginTop: 3, lineHeight: 1.4 }}>{d.roiNote}</div>
              ) : null}
            </td>
            <td style={{ padding: '10px 16px', fontSize: 11 }}>{recordKindLabel(d.recordKind)}</td>
            <td style={{ padding: '10px 16px', fontSize: 11, color: BRAND.grayDark }}>{d.docSubtype || '—'}</td>
            <td style={{ padding: '10px 16px', fontSize: 11, color: BRAND.gray }}>{d.provider || '—'}</td>
            {showLocation && <td style={{ padding: '10px 16px', color: BRAND.gray }}>{locationLabel(locations, d.locationId)}</td>}
            <td style={{ padding: '10px 16px', color: BRAND.gray }}>{d.date}</td>
            <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {formatDocAmount(d.amount)}
            </td>
            {onEdit && (
              <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                <button type="button" onClick={() => onEdit(d)} style={iconBtn} title="Edit document">
                  <EditIcon />
                </button>
              </td>
            )}
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MiniContractTable({
  contracts,
  documents,
  locations,
  showLocation,
  onEdit,
}: {
  contracts: CandidContractRecord[];
  documents: CustomerDocument[];
  locations: Location[];
  showLocation: boolean;
  onEdit: (c: CandidContractRecord) => void;
}) {
  if (!contracts.length) return <EmptyRow text="No contracts." />;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: BRAND.grayLight }}>
          <Th>Service</Th>
          <Th>Pay source</Th>
          <Th>Agent</Th>
          <Th>Rate</Th>
          <Th>MRR</Th>
          <Th>Status</Th>
          {showLocation && <Th>Location</Th>}
          <Th>Deal ID</Th>
          <Th center>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {contracts.map((ct) => {
          const relatedDoc = findDocumentForContract(ct, documents);
          const viewHref = relatedDoc ? documentViewUrl(relatedDoc) : null;
          return (
          <tr key={ct.id} style={{ borderBottom: `1px solid ${BRAND.grayBorder}` }}>
            <td style={{ padding: '10px 16px' }}>
              <button
                type="button"
                onClick={() => onEdit(ct)}
                style={{ background: 'none', border: 'none', color: BRAND.red, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}
              >
                {contractServiceTitle(ct)}
              </button>
              {ct.solutionDescription ? (
                <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 3, lineHeight: 1.4 }}>{ct.solutionDescription}</div>
              ) : null}
              {ct.serviceBreakdown ? (
                <div style={{ fontSize: 10, color: BRAND.gray, marginTop: 3, lineHeight: 1.4 }}>
                  {formatServiceBreakdownLines(ct.serviceBreakdown).slice(0, 2).join(' · ')}
                  {formatServiceBreakdownLines(ct.serviceBreakdown).length > 2 ? '…' : ''}
                </div>
              ) : null}
              {ct.paySource ? (
                <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>{ct.paySource}</div>
              ) : null}
              {(ct.contractStartDate || ct.contractEndDate) && (
                <div style={{ fontSize: 10, color: BRAND.gray, marginTop: 2 }}>
                  {[ct.contractStartDate, ct.contractEndDate].filter(Boolean).join(' → ')}
                </div>
              )}
            </td>
            <td style={{ padding: '10px 16px', fontSize: 12 }}>{ct.paySource || '—'}</td>
            <td style={{ padding: '10px 16px', fontSize: 12 }}>{ct.agentOfRecord || '—'}</td>
            <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {ct.agentCommissionRate != null ? `${ct.agentCommissionRate}%` : '—'}
            </td>
            <td style={{ padding: '10px 16px' }}>{ct.monthly ? `$${ct.monthly.toLocaleString()}` : '—'}</td>
            <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: ct.dealStatus === 'active' ? BRAND.green : BRAND.amber }}>{ct.dealStatus}</td>
            {showLocation && <td style={{ padding: '10px 16px', color: BRAND.gray, fontSize: 12 }}>{locationLabel(locations, ct.locationId)}</td>}
            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{ct.dealId || '—'}</td>
            <td style={{ padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {relatedDoc && viewHref ? (
                  <a
                    href={viewHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={iconBtn}
                    title={`View ${relatedDoc.filename}`}
                  >
                    <EyeIcon />
                  </a>
                ) : relatedDoc ? (
                  <span
                    style={{ ...iconBtn, opacity: 0.35, cursor: 'not-allowed' }}
                    title={`${relatedDoc.filename} is on file but not available to view`}
                  >
                    <EyeIcon />
                  </span>
                ) : null}
                <button type="button" onClick={() => onEdit(ct)} style={iconBtn} title="Edit contract"><EditIcon /></button>
              </div>
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ContactDetailModal({
  contact,
  company,
  onClose,
  onEdit,
  onViewAsContact,
}: {
  contact: Contact;
  company: string;
  onClose: () => void;
  onEdit: () => void;
  onViewAsContact?: (contact: Contact) => void;
}) {
  const emails = contact.recentEmails ?? [
    { subject: 'Re: Monthly statement review', date: 'Apr 12, 2026' },
    { subject: 'Introduction — Candid team', date: 'Mar 28, 2026' },
  ];
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 750, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: BRAND.white, borderRadius: 12, width: 480, maxWidth: '95vw', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: BRAND.grayDark }}>{contact.name}</div>
            <div style={{ fontSize: 12, color: BRAND.gray }}>{contact.role} · {company}</div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          <strong>Email:</strong>{' '}
          {contact.email ? <a href={`mailto:${contact.email}`} style={{ color: BRAND.blue }}>{contact.email}</a> : '—'}
        </div>
        <div style={{ fontSize: 13, marginBottom: 16 }}>
          <strong>Phone:</strong>{' '}
          {contact.phone ? <a href={`tel:${contact.phone.replace(/\D/g, '')}`} style={{ color: BRAND.blue }}>{contact.phone}</a> : '—'}
        </div>
        {contact.portalAccess && (
          <div style={{ background: 'rgba(26,122,74,0.08)', border: '1px solid rgba(26,122,74,0.2)', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.55 }}>
            <strong>Portal access:</strong> {portalTierLabel(contact.portalAccessTier ?? 'trial')}
            {contact.locationIds?.length ? (
              <span style={{ display: 'block', marginTop: 4, color: BRAND.gray }}>
                Scoped to {contact.locationIds.length} location{contact.locationIds.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span style={{ display: 'block', marginTop: 4, color: BRAND.gray }}>All locations for this customer</span>
            )}
            {contact.portalInviteSentAt && (
              <span style={{ display: 'block', marginTop: 4, color: BRAND.green, fontSize: 12 }}>
                Portal access configured {new Date(contact.portalInviteSentAt).toLocaleDateString()}
              </span>
            )}
          </div>
        )}
        {contact.crmNotes && (
          <div style={{ background: BRAND.grayLight, borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.55 }}>{contact.crmNotes}</div>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.gray, textTransform: 'uppercase', marginBottom: 8 }}>Recent email</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: BRAND.grayDark }}>
          {emails.map((e, i) => <li key={i} style={{ marginBottom: 6 }}>{e.subject} <span style={{ color: BRAND.gray }}>({e.date})</span></li>)}
        </ul>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {contact.portalAccess && onViewAsContact && (
            <button
              type="button"
              onClick={() => { onViewAsContact(contact); onClose(); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: BRAND.white, color: BRAND.grayDark, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 6, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <LogInIcon /> View portal as customer
            </button>
          )}
          <button type="button" onClick={onEdit} style={{ background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`, color: BRAND.white, border: 'none', borderRadius: 6, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Edit contact</button>
        </div>
      </div>
    </div>
  );
}
