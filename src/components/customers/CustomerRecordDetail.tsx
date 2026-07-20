'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  calcCandidCommissionAmount,
  recordKindLabel,
  recordKindToLegacyFileType,
  type CandidContractRecord,
  type CustomerDocument,
  type DealStatus,
} from '@/lib/customer-records';
import { AddCustomerRecordsModal, type AddCustomerRecordsResult } from '@/components/customers/AddCustomerRecordsModal';
import { CreateQuoteModal } from '@/components/customers/CreateQuoteModal';
import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import { ContractDocumentLink } from '@/components/customers/ContractDocumentLink';
import type { Contact, Customer, Location } from '@/components/CustomersView';
import {
  CustomerActionsBanner,
  customerActionsBannerHasContent,
} from '@/components/customers/CustomerActionsBanner';
import { CustomerRelationshipPulse } from '@/components/customers/CustomerRelationshipPulse';
import { customerDocumentUrl, isCustomerDocumentAvailable } from '@/lib/crm/document-url';
import { openDocumentViewer } from '@/lib/document-viewer';
import { saveCrmRecord, saveCustomerProfile, saveCustomerProfileFromPatch } from '@/lib/crm/client-persist';
import type { CustomerAction } from '@/lib/portal-import/merge';
import type { ResolvedCustomerAction } from '@/lib/customer-actions-store';
import { formatServiceBreakdownLines } from '@/lib/service-breakdown-display';
import { portalTierLabel } from '@/lib/portal-access';
import type { MemberExternalServiceAsset } from '@/lib/crm/member-external-services';
import {
  formatMemberExternalMonthly,
  markMemberServiceCandidManaged,
  memberExternalFilename,
} from '@/lib/crm/member-external-services';
import { CustomerRemindersSection } from '@/components/customers/CustomerRemindersSection';
import { CustomerAnalysisSection } from '@/components/customers/CustomerAnalysisSection';
import { TeamNotesPanel } from '@/components/admin/TeamNotesPanel';
import { CustomerEmailPanel } from '@/components/customers/CustomerEmailPanel';
import { CustomerCommunicationsPanel } from '@/components/customers/CustomerCommunicationsPanel';
import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import { analysisReviewsForCustomer } from '@/lib/crm/customer-lookup';
import type { CustomerReminderKind } from '@/lib/customer-reminders/types';

function formatDocAmount(amount?: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

import { BRAND } from '@/lib/ui/brand-tokens';

const PANEL_SCROLL: React.CSSProperties = { maxHeight: 340, overflowY: 'auto', overflowX: 'auto' };

const iconBase = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ChevronLeftIcon = () => (<svg {...iconBase}><polyline points="15 18 9 12 15 6" /></svg>);
const ChevronDownIcon = () => (<svg {...iconBase}><polyline points="6 9 12 15 18 9" /></svg>);
const PlusIcon = () => (<svg {...iconBase}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const PhoneIcon = () => (<svg {...iconBase}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>);
const MailIcon = () => (<svg {...iconBase}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>);
const MessageIcon = () => (<svg {...iconBase}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
const MapPinIcon = () => (<svg {...iconBase}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);
const UserIcon = () => (<svg {...iconBase}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
const EditIcon = () => (<svg {...iconBase}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);
const LogInIcon = () => (<svg {...iconBase}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>);
const TrashIcon = () => (<svg {...iconBase}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>);
const SearchIcon = () => (<svg {...iconBase}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);
const BellIcon = () => (<svg {...iconBase}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>);

// Larger icons for the floating section rail
const railIcon = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const BuildingIconR = () => (<svg {...railIcon}><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" /><path d="M3 21h18" /><line x1="9" y1="7" x2="10" y2="7" /><line x1="9" y1="11" x2="10" y2="11" /><line x1="9" y1="15" x2="10" y2="15" /><line x1="14" y1="7" x2="15" y2="7" /><line x1="14" y1="11" x2="15" y2="11" /><line x1="14" y1="15" x2="15" y2="15" /></svg>);
const NotesIconR = () => (<svg {...railIcon}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
const EnvelopeIconR = () => (<svg {...railIcon}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>);
const PhoneIconR = () => (<svg {...railIcon}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>);
const ChartIconR = () => (<svg {...railIcon}><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="10" /></svg>);
const FileTextIconR = () => (<svg {...railIcon}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>);
const FileIconR = () => (<svg {...railIcon}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>);
const MapPinIconR = () => (<svg {...railIcon}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);
const UserIconR = () => (<svg {...railIcon}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
const BellIconR = () => (<svg {...railIcon}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>);

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

const Th: React.FC<{
  children: React.ReactNode;
  center?: boolean;
  right?: boolean;
  style?: React.CSSProperties;
}> = ({ children, center, right, style }) => (
  <th
    style={{
      padding: '11px 16px',
      textAlign: center ? 'center' : right ? 'right' : 'left',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: BRAND.gray,
      position: 'sticky',
      top: 0,
      background: BRAND.grayLight,
      zIndex: 1,
      ...style,
    }}
  >
    {children}
  </th>
);

function previewFirstWords(text: string, maxWords = 15): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(' ')}…`;
}

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
  onAfterRecordSaved?: () => void;
  onEditCustomer: () => void;
  onAddContact: () => void;
  onEditContact: (c: Contact) => void;
  onAddLocation: () => void;
  onEditLocation: (l: Location) => void;
  onEditContract: (c: CandidContractRecord) => void;
  onMergeContracts?: (a: CandidContractRecord, b: CandidContractRecord) => void;
  onViewAsContact?: (contact: Contact) => void;
  onEditDocument?: (doc: CustomerDocument) => void;
  openActions?: CustomerAction[];
  resolvedActions?: ResolvedCustomerAction[];
  contractActions?: import('@/lib/services/contract-submit-actions').ContractSubmitActionRow[];
  onResolveAction?: (action: CustomerAction) => void;
  onAddCustomAction?: () => void;
  onOpenRecommendationsHub?: () => void;
  onContractPipelineUpdated?: () => void;
  onAddReminder: (kind: CustomerReminderKind, contract?: CandidContractRecord) => void;
  remindersRefresh: number;
  analysisReviews?: BillAnalysisReviewRow[];
  onOpenAnalysisReview?: (reviewId: string) => void;
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
  onAfterRecordSaved,
  onEditCustomer,
  onAddContact,
  onEditContact,
  onAddLocation,
  onEditLocation,
  onEditContract,
  onMergeContracts,
  onViewAsContact,
  onEditDocument,
  openActions = [],
  resolvedActions = [],
  contractActions = [],
  onResolveAction,
  onAddCustomAction,
  onOpenRecommendationsHub,
  onContractPipelineUpdated,
  onAddReminder,
  remindersRefresh,
  analysisReviews = [],
  onOpenAnalysisReview,
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
  const [createQuoteOpen, setCreateQuoteOpen] = useState(false);
  const [pendingAddRecord, setPendingAddRecord] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [contractSearch, setContractSearch] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [locContactMenu, setLocContactMenu] = useState<string | null>(null);
  const [contractReminderMenu, setContractReminderMenu] = useState<string | null>(null);
  const [contactDeleteId, setContactDeleteId] = useState<string | null>(null);
  const [contactDeletePos, setContactDeletePos] = useState<{ top: number; left: number } | null>(null);
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([]);
  const [bizInfoOpen, setBizInfoOpen] = useState(false);
  const [memberExternalServices, setMemberExternalServices] = useState<MemberExternalServiceAsset[]>([]);
  const [memberExternalServicesTick, setMemberExternalServicesTick] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const contactDeleteBtnRef = useRef<HTMLButtonElement>(null);
  const contactDeletePopoverRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedContractIds((prev) => prev.filter((id) => contracts.some((ct) => ct.id === id)));
  }, [contracts]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleContractSelect = (id: string) => {
    setSelectedContractIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1]!, id];
      return [...prev, id];
    });
  };

  const openMergeSelected = () => {
    if (!onMergeContracts || selectedContractIds.length !== 2) return;
    const a = contracts.find((ct) => ct.id === selectedContractIds[0]);
    const b = contracts.find((ct) => ct.id === selectedContractIds[1]);
    if (!a || !b) return;
    onMergeContracts(a, b);
  };

  const mergeToolbar = (
    <>
      {onMergeContracts && selectedContractIds.length === 2 ? (
        <button type="button" onClick={openMergeSelected} style={{ ...btnSmall, background: BRAND.red, color: BRAND.white, borderColor: BRAND.red }}>
          Merge selected
        </button>
      ) : onMergeContracts && selectedContractIds.length > 0 ? (
        <span style={{ fontSize: 11, color: BRAND.gray }}>Select 2 deals to merge</span>
      ) : null}
      {selectedContractIds.length > 0 ? (
        <button type="button" onClick={() => setSelectedContractIds([])} style={btnSmall}>
          Clear
        </button>
      ) : null}
    </>
  );

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setLocContactMenu(null);
      const t = e.target as Node;
      const inBtn = contactDeleteBtnRef.current?.contains(t);
      const inPopover = contactDeletePopoverRef.current?.contains(t);
      if (!inBtn && !inPopover) setContactDeleteId(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useLayoutEffect(() => {
    if (!contactDeleteId) {
      setContactDeletePos(null);
      return;
    }
    const update = () => {
      const btn = contactDeleteBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = 260;
      const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
      setContactDeletePos({ top: r.top - 8, left });
    };
    update();
    window.addEventListener('resize', update);
    // capture scroll from nested panels too
    document.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [contactDeleteId]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/crm/member-external-services?customerId=${encodeURIComponent(c.id)}`)
      .then((res) => (res.ok ? res.json() : { services: [] }))
      .then((data: { services?: MemberExternalServiceAsset[] }) => {
        if (!cancelled) setMemberExternalServices(data.services ?? []);
      })
      .catch(() => {
        if (!cancelled) setMemberExternalServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [c.id, memberExternalServicesTick]);

  const refreshMemberExternalServices = () => {
    setMemberExternalServicesTick((n) => n + 1);
  };

  const openReminderFromContract = (kind: CustomerReminderKind, contract?: CandidContractRecord) => {
    onAddReminder(kind, contract);
    setContractReminderMenu(null);
  };

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
      return [ct.name, ct.role, ct.email, ct.altEmail, ct.phone, ct.crmNotes, ...locNames]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [c.contacts, c.locations, contactSearch]);

  const customerAnalysisReviews = useMemo(
    () => analysisReviewsForCustomer(analysisReviews, c),
    [analysisReviews, c],
  );

  const [pulseVisible, setPulseVisible] = useState(false);
  const actionsVisible = customerActionsBannerHasContent({
    actions: openActions,
    resolvedActions,
    contractActions,
    salesPitch: c.portal?.salesPitch?.opening,
  });

  const sectionNav = useMemo(() => {
    const items: { id: string; label: string; mobileLabel: string; icon: React.ReactNode }[] = [];
    if (actionsVisible) {
      items.push({ id: 'acct-sec-actions', label: 'Actions', mobileLabel: 'Actions', icon: <BellIconR /> });
    }
    if (customerAnalysisReviews.length > 0) {
      items.push({ id: 'acct-sec-analyses', label: 'Analyses', mobileLabel: 'Analyses', icon: <ChartIconR /> });
    }
    if (pulseVisible) {
      items.push({ id: 'acct-sec-pulse', label: 'Relationship pulse', mobileLabel: 'Pulse', icon: <BellIconR /> });
    }
    items.push({ id: 'acct-sec-business', label: 'Business Information', mobileLabel: 'Business', icon: <BuildingIconR /> });
    items.push({ id: 'acct-sec-notes', label: 'Team Notes', mobileLabel: 'Notes', icon: <NotesIconR /> });
    items.push({ id: 'acct-sec-email', label: 'Email', mobileLabel: 'Email', icon: <EnvelopeIconR /> });
    items.push({ id: 'acct-sec-comms', label: 'Communications', mobileLabel: 'Comms', icon: <PhoneIconR /> });
    items.push({ id: 'acct-sec-locations', label: 'Locations', mobileLabel: 'Locations', icon: <MapPinIconR /> });
    items.push({ id: 'acct-sec-contacts', label: 'Contacts', mobileLabel: 'Contacts', icon: <UserIconR /> });
    items.push({ id: 'acct-sec-reminders', label: 'Reminders', mobileLabel: 'Reminders', icon: <BellIconR /> });
    items.push({ id: 'acct-sec-contracts', label: 'Contracts & Deals', mobileLabel: 'Contracts', icon: <FileTextIconR /> });
    items.push({ id: 'acct-sec-documents', label: 'Documents', mobileLabel: 'Docs', icon: <FileIconR /> });
    return items;
  }, [actionsVisible, customerAnalysisReviews.length, pulseVisible]);

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
    if (!docSearching && primaryLocId) {
      const atPrimary = list.filter((d) => d.locationId === primaryLocId);
      if (atPrimary.length > 0) list = atPrimary;
    }
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

  const handleAddRecord = async (result: AddCustomerRecordsResult) => {
    try {
      if (result.profilePatch) {
        const p = result.profilePatch;
        const customerPatch: Partial<Customer> = {};
        if (p.website) customerPatch.website = p.website;
        if (p.mccCode) customerPatch.mccCode = p.mccCode;
        if (Object.keys(customerPatch).length > 0) {
          onUpdateCustomer(customerPatch);
        }
        const savedLocation = await saveCustomerProfileFromPatch(c.id, p, primaryLocation(c));
        if (savedLocation) {
          onUpsertLocation(savedLocation);
        }
      } else if (c.locations.length === 0) {
        const loc: Location = {
          id: `loc-${c.id}-primary`,
          label: 'Primary',
          street: '',
          city: '',
          state: '',
          zip: '',
          isPrimary: true,
        };
        await saveCustomerProfile({ customerId: c.id, location: loc });
        onUpsertLocation(loc);
      }

      if (result.type === 'document') {
        const activeContracts = contracts.filter(
          (ct) => ct.dealStatus === 'active' || ct.dealStatus === 'expiring',
        );
        const doc =
          !result.doc.contractId &&
          (result.doc.recordKind === 'candid_contract' ||
            result.doc.recordKind === 'external_contract') &&
          activeContracts.length === 1
            ? { ...result.doc, contractId: activeContracts[0]!.id }
            : result.doc;
        const saved = await saveCrmRecord({
          customerId: c.id,
          document: doc,
          file: result.file,
        });
        onDocumentsChange([saved, ...documents]);
        onUpdateCustomer({ files: (c.files ?? 0) + 1 });
      } else {
        const saved = await saveCrmRecord({
          customerId: c.id,
          document: result.doc,
          contract: result.contract,
          file: result.file,
        });
        onDocumentsChange([saved, ...documents]);
        onContractsChange([result.contract, ...contracts]);
        onUpdateCustomer({ files: (c.files ?? 0) + 1, contracts: (c.contracts ?? 0) + 1 });
      }
      onAfterRecordSaved?.();
      window.dispatchEvent(new Event('candid-contract-updated'));
      setAddRecordsOpen(false);
    } catch (err) {
      console.error('Failed to save record', err);
      window.alert(err instanceof Error ? err.message : 'Failed to save record');
    }
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
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {mergeToolbar}
              <button type="button" onClick={openAddRecords} style={btnSmall}><PlusIcon /> Add</button>
            </div>
          }
        >
          <MiniContractTable
            contracts={locContracts}
            documents={documents}
            locations={c.locations}
            showLocation={false}
            onEdit={onEditContract}
            selectedIds={selectedContractIds}
            onToggleSelect={onMergeContracts ? toggleContractSelect : undefined}
            onAddReminder={openReminderFromContract}
            reminderMenuId={contractReminderMenu}
            onReminderMenuToggle={setContractReminderMenu}
          />
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
    <div className="acct-detail-shell" style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 'calc(100vh - 100px)' }}>
      <nav className="acct-mobile-section-nav" aria-label="Jump to account section">
        {sectionNav.map((item) => (
          <button
            key={item.id}
            type="button"
            className="acct-mobile-section-pill"
            onClick={() => {
              if (item.id === 'acct-sec-business') {
                setBizInfoOpen(true);
              }
              scrollToSection(item.id);
            }}
            aria-label={item.label}
          >
            {item.icon}
            <span className="acct-mobile-section-pill-label">{item.mobileLabel}</span>
          </button>
        ))}
      </nav>
      <div
        id="acct-sec-business"
        style={{
          background: 'var(--panel-dark)',
          borderRadius: 10,
          marginBottom: 12,
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
          scrollMarginTop: 8,
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})` }} />
        <div style={{ padding: '14px 18px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: '#FFFFFF' }}>{c.company}</div>
              <button
                type="button"
                onClick={onEditCustomer}
                title="Edit business information"
                aria-label="Edit business information"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: 0,
                }}
                onMouseOver={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
              >
                <EditIcon />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {telHref ? (
                <a href={telHref} style={{ ...heroBtn, textDecoration: 'none' }} title={`Call ${primaryCt?.name ?? 'contact'}`}>
                  <PhoneIcon /> Call
                </a>
              ) : (
                <span style={{ ...heroBtn, opacity: 0.45, cursor: 'not-allowed' }} title="No phone on file"><PhoneIcon /> Call</span>
              )}
              {mailHref ? (
                <a href={mailHref} style={{ ...heroBtn, textDecoration: 'none' }} title={`Email ${primaryCt?.name ?? 'contact'}`}>
                  <MailIcon /> Email
                </a>
              ) : (
                <span style={{ ...heroBtn, opacity: 0.45, cursor: 'not-allowed' }} title="No email on file"><MailIcon /> Email</span>
              )}
              {smsHref ? (
                <a href={smsHref} style={{ ...heroBtn, textDecoration: 'none' }} title={`Text ${primaryCt?.name ?? 'contact'}`}>
                  <MessageIcon /> SMS
                </a>
              ) : (
                <span style={{ ...heroBtn, opacity: 0.45, cursor: 'not-allowed' }} title="No mobile on file"><MessageIcon /> SMS</span>
              )}
              <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.18)', margin: '0 4px', flexShrink: 0 }} aria-hidden />
              <button type="button" onClick={() => setCreateQuoteOpen(true)} style={heroBtn}>
                <PlusIcon /> Quote
              </button>
              <button
                type="button"
                onClick={openAddRecords}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <PlusIcon /> Document
              </button>
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#CBD5E1' }}>
              <span style={{ color: '#64748B', display: 'inline-flex' }}><MapPinIcon /></span>
              {formatLocation(primaryLoc)}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#CBD5E1' }}>
              <span style={{ color: '#64748B', display: 'inline-flex' }}><UserIcon /></span>
              {primaryCt ? (
                <>
                  {primaryCt.name}
                  {contactEmail ? <span style={{ color: '#94A3B8' }}> · {contactEmail}</span> : null}
                  {contactPhone ? <span style={{ color: '#94A3B8' }}> · {contactPhone}</span> : null}
                </>
              ) : (
                'No primary contact'
              )}
            </span>
            <button
              type="button"
              onClick={() => setBizInfoOpen((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: '#E2E8F0',
                cursor: 'pointer',
              }}
              aria-expanded={bizInfoOpen}
            >
              Business information
              <span style={{ display: 'inline-flex', transform: bizInfoOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
                <ChevronDownIcon />
              </span>
            </button>
          </div>
        </div>
        {bizInfoOpen && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', maxHeight: 320, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, padding: '16px 18px' }}>
              <DarkInfoField label="Legal Name" value={c.companyLegal} />
              <DarkInfoField label="Industry" value={c.industry} />
              <DarkInfoField label="Website" value={c.website ? c.website.replace(/^https?:\/\//, '') : undefined} />
              <DarkInfoField label="Alt Website" value={c.altWebsite ? c.altWebsite.replace(/^https?:\/\//, '') : undefined} />
              <DarkInfoField
                label="LinkedIn"
                value={
                  c.linkedinUrl
                    ? c.linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\/company\//i, 'linkedin.com/company/')
                    : undefined
                }
              />
              <DarkInfoField label="Tax ID / EIN" value={c.taxId} />
              <DarkInfoField label="MCC Code" value={c.mccCode} />
              <DarkInfoField label="Corp Type" value={c.corpType} />
              <DarkInfoField label="Founded Year" value={c.foundedYear} />
              <DarkInfoField label="Employee Count" value={c.employeeCount} />
              <DarkInfoField label="Main Phone (Company)" value={c.mainPhone} />
              <DarkInfoField label="CEO / Founder / Principal" value={c.ceoPrincipal} />
              <DarkInfoField label="Annual Revenue" value={c.annualRevenue} />
              <DarkInfoField label="Funding / Ownership Type" value={c.fundingOwnershipType} />
              <DarkInfoField label="Parent Company / Brand" value={c.parentCompany} />
              <DarkInfoField label="Public Location Count" value={c.publicLocationCount} />
              <DarkInfoField label="Facebook" value={c.facebookUrl} />
              <DarkInfoField label="Instagram" value={c.instagramUrl} />
              <DarkInfoField label="X / Twitter" value={c.twitterUrl} />
              <DarkInfoField label="YouTube" value={c.youtubeUrl} />
              <DarkInfoField label="Google Business / Maps" value={c.googleBusinessUrl} />
              {c.technologies && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <DarkInfoField label="Technologies (POS / payments / phone)" value={c.technologies} />
                </div>
              )}
              <DarkInfoField label="Primary Address" value={formatLocation(primaryLoc)} />
              <DarkInfoField label="Sales Agent" value={c.agent} />
              <DarkInfoField label="Member Since" value={c.since} />
              <DarkInfoField
                label="Monthly savings"
                value={
                  c.savings > 0
                    ? `$${Math.round(c.savings).toLocaleString('en-US')}/mo`
                    : undefined
                }
              />
              {c.portal?.totalCandidMrc != null && c.portal.totalCandidMrc > 0 && (
                <DarkInfoField label="Candid MRC" value={`$${c.portal.totalCandidMrc.toFixed(2)}/mo`} />
              )}
              {c.portal?.billingCycle && (
                <DarkInfoField label="Billing cycle" value={c.portal.billingCycle} />
              )}
              {c.portal?.previousProviderMrc != null && (
                <DarkInfoField label="Previous provider MRC" value={`$${c.portal.previousProviderMrc.toFixed(2)}/mo`} />
              )}
              {c.portal?.savingsVsPrevious != null && c.portal.savingsVsPrevious > 0 && (
                <DarkInfoField label="Savings vs previous" value={`$${c.portal.savingsVsPrevious.toFixed(2)}/mo`} />
              )}
              {c.portal?.previousProvider?.provider && (
                <div style={{ gridColumn: '1 / -1', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 8 }}>
                    Previous provider
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <DarkInfoField label="Provider" value={c.portal.previousProvider.provider} />
                    {c.portal.previousProvider.accountNum && (
                      <DarkInfoField label="Account #" value={c.portal.previousProvider.accountNum} />
                    )}
                    {c.portal.previousProvider.lastInvoiceAmount != null && (
                      <DarkInfoField label="Last invoice" value={formatDocAmount(c.portal.previousProvider.lastInvoiceAmount)} />
                    )}
                    {c.portal.previousProvider.lastInvoiceDate && (
                      <DarkInfoField label="Invoice date" value={c.portal.previousProvider.lastInvoiceDate} />
                    )}
                    {c.portal.previousProvider.product && (
                      <DarkInfoField label="Product" value={c.portal.previousProvider.product} />
                    )}
                  </div>
                  {c.portal.previousProvider.note && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#94A3B8', lineHeight: 1.5 }}>
                      {c.portal.previousProvider.note}
                    </div>
                  )}
                </div>
              )}
              {(c.portal?.nonCandidServices?.length ?? 0) > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <DarkInfoField
                    label="Non-Candid services"
                    value={c.portal!.nonCandidServices!
                      .map((svc) => `${svc.provider}${svc.product ? ` — ${svc.product}` : ''}${svc.mrc != null ? ` ($${svc.mrc}/mo)` : ''}`)
                      .join(' · ')}
                  />
                </div>
              )}
              {c.portal?.financialNotes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <DarkInfoField label="Portfolio notes" value={c.portal.financialNotes} />
                </div>
              )}
              {c.notes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <DarkInfoField label="Internal notes" value={c.notes} />
                </div>
              )}
              {c.description && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <DarkInfoField label="Description" value={c.description} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div ref={scrollContainerRef} className="acct-detail-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
        <CustomerActionsBanner
          actions={openActions}
          resolvedActions={resolvedActions}
          contractActions={contractActions}
          salesPitch={c.portal?.salesPitch?.opening}
          customerId={c.id}
          companyName={c.company}
          portal={c.portal}
          onResolveAction={onResolveAction}
          onAddCustomAction={onAddCustomAction}
          onOpenRecommendationsHub={onOpenRecommendationsHub}
          onContractPipelineUpdated={onContractPipelineUpdated}
        />

        <CustomerRelationshipPulse
          customerId={c.id}
          customerName={c.company}
          contactEmail={contactEmail || undefined}
          onVisibilityChange={setPulseVisible}
        />

        <div id="acct-sec-analyses" style={{ scrollMarginTop: 8 }}>
          <CustomerAnalysisSection
            reviews={customerAnalysisReviews}
            onOpenReview={onOpenAnalysisReview}
          />
        </div>

        <ScrollSection id="acct-sec-notes" title="Team notes" subtitle="Shared internal notes — use @username to notify teammates">
          <TeamNotesPanel contextType="customer" contextKey={c.id} />
        </ScrollSection>

        <ScrollSection
          id="acct-sec-email"
          title="Email"
          subtitle={contactEmail ? `Conversation with ${contactEmail}` : 'No primary contact email on file'}
        >
          <div style={{ padding: 16 }}>
            <CustomerEmailPanel
              email={contactEmail || undefined}
              customerName={c.company}
              contacts={contactsAtLocation(c.contacts, primaryLocId, primaryCt?.id ?? '')
                .flatMap((ct) => {
                  const rows: { name: string; email: string; role?: string }[] = [];
                  if (ct.email?.trim() && ct.email.toLowerCase() !== contactEmail.toLowerCase()) {
                    rows.push({ name: ct.name, email: ct.email, role: ct.role });
                  }
                  if (
                    ct.altEmail?.trim() &&
                    ct.altEmail.toLowerCase() !== contactEmail.toLowerCase() &&
                    ct.altEmail.toLowerCase() !== (ct.email ?? '').toLowerCase()
                  ) {
                    rows.push({
                      name: ct.name,
                      email: ct.altEmail,
                      role: ct.role ? `${ct.role} · alt` : 'Alt email',
                    });
                  }
                  return rows;
                })}
              associatedContacts={c.contacts
                .flatMap((ct) => {
                  if ((ct.locationIds ?? []).includes(primaryLocId)) return [];
                  const rows: { name: string; email: string; role?: string; relation?: string }[] = [];
                  if (ct.email?.trim() && ct.email.toLowerCase() !== contactEmail.toLowerCase()) {
                    rows.push({ name: ct.name, email: ct.email, role: ct.role, relation: ct.role });
                  }
                  if (
                    ct.altEmail?.trim() &&
                    ct.altEmail.toLowerCase() !== contactEmail.toLowerCase() &&
                    ct.altEmail.toLowerCase() !== (ct.email ?? '').toLowerCase()
                  ) {
                    rows.push({
                      name: ct.name,
                      email: ct.altEmail,
                      role: ct.role,
                      relation: 'Alt email',
                    });
                  }
                  return rows;
                })}
            />
          </div>
        </ScrollSection>

        <ScrollSection
          id="acct-sec-comms"
          title="Communications"
          subtitle="Calls and meetings matched to contacts on this account"
        >
          <div style={{ padding: 16 }}>
            <CustomerCommunicationsPanel
              customerId={c.id}
              customerName={c.company}
              contacts={c.contacts}
            />
          </div>
        </ScrollSection>

        <ScrollSection
          id="acct-sec-locations"
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
          id="acct-sec-contacts"
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
                    {ct.altEmail ? (
                      <div style={{ marginTop: 2 }}>
                        <a href={`mailto:${ct.altEmail}`} style={{ color: BRAND.gray, textDecoration: 'none', fontSize: 11 }}>
                          alt: {ct.altEmail}
                        </a>
                      </div>
                    ) : null}
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
                      <button
                        type="button"
                        ref={contactDeleteId === ct.id ? contactDeleteBtnRef : undefined}
                        onClick={() => setContactDeleteId(contactDeleteId === ct.id ? null : ct.id)}
                        style={iconBtn}
                        title="Delete contact"
                        aria-expanded={contactDeleteId === ct.id}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollSection>

        <div id="acct-sec-reminders" style={{ scrollMarginTop: 8 }}>
          <CustomerRemindersSection
            customer={c}
            contracts={contracts}
            refreshToken={remindersRefresh}
            onAdd={onAddReminder}
            scrollSection={ScrollSection}
            emptyRow={EmptyRow}
          />
        </div>

        <ScrollSection
          id="acct-sec-contracts"
          title="Active Contracts / Deals"
          subtitle={
            contractSearching
              ? `${filteredContracts.length} matching`
              : `${contracts.length} deal${contracts.length === 1 ? '' : 's'} across ${c.locations.length || 1} location${c.locations.length === 1 ? '' : 's'}`
          }
          headerRight={<HeaderSearch value={contractSearch} onChange={setContractSearch} placeholder="Search contracts…" />}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {mergeToolbar}
              <button type="button" onClick={openAddRecords} style={btnSmall}><PlusIcon /> Add</button>
            </div>
          }
        >
          <MiniContractTable
            contracts={filteredContracts}
            documents={documents}
            locations={c.locations}
            showLocation={showContractLocations}
            onEdit={onEditContract}
            selectedIds={selectedContractIds}
            onToggleSelect={onMergeContracts ? toggleContractSelect : undefined}
            onAddReminder={openReminderFromContract}
            reminderMenuId={contractReminderMenu}
            onReminderMenuToggle={setContractReminderMenu}
          />
          {memberExternalServices.length > 0 && (
            <MemberTrackedExternalTable
              title="Member-tracked services (not with Candid)"
              rows={memberExternalServices}
              mode="contract"
              customerId={c.id}
              onMarkedCandidManaged={refreshMemberExternalServices}
            />
          )}
        </ScrollSection>

        <ScrollSection
          id="acct-sec-documents"
          title="Documents"
          subtitle={docSearching ? 'Searching all locations' : `Primary location: ${primaryLoc?.label ?? '—'}`}
          headerRight={<HeaderSearch value={docSearch} onChange={setDocSearch} placeholder="Search documents…" />}
          actions={<button type="button" onClick={openAddRecords} style={btnSmall}><PlusIcon /> Add</button>}
        >
          <MiniDocTable docs={filteredDocs} locations={c.locations} showLocation={docSearching} onEdit={onEditDocument} />
          {memberExternalServices.some((s) => s.billStoragePath) && (
            <MemberTrackedExternalTable
              title="Member-uploaded bills (not with Candid)"
              rows={memberExternalServices.filter((s) => s.billStoragePath)}
              mode="document"
              customerId={c.id}
              onMarkedCandidManaged={refreshMemberExternalServices}
            />
          )}
        </ScrollSection>
      </div>

      <nav className="acct-section-rail" aria-label="Jump to account section">
        {sectionNav.map((item) => (
          <button
            key={item.id}
            type="button"
            className="acct-section-rail-btn"
            onClick={() => {
              if (item.id === 'acct-sec-business') {
                setBizInfoOpen(true);
                scrollToSection('acct-sec-business');
                return;
              }
              scrollToSection(item.id);
            }}
            aria-label={item.label}
          >
            {item.icon}
            <span className="acct-section-rail-tip">{item.label}</span>
          </button>
        ))}
      </nav>

      {addRecordsOpen && recordLocationId && (
        <AddCustomerRecordsModal
          customerId={c.id}
          locations={c.locations}
          defaultLocationId={recordLocationId}
          uploadedBy={uploadedBy}
          customerWebsite={c.website}
          customerMccCode={c.mccCode}
          primaryLocation={primaryLoc ?? null}
          onClose={() => setAddRecordsOpen(false)}
          onSave={handleAddRecord}
        />
      )}

      {createQuoteOpen && (
        <CreateQuoteModal
          customerId={c.id}
          customerName={c.company}
          onClose={() => setCreateQuoteOpen(false)}
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

      {contactDeleteId && contactDeletePos && typeof document !== 'undefined' && createPortal(
        <div
          ref={contactDeletePopoverRef}
          role="dialog"
          aria-label="Confirm delete contact"
          style={{
            position: 'fixed',
            top: contactDeletePos.top,
            left: contactDeletePos.left,
            transform: 'translateY(-100%)',
            zIndex: 10000,
            width: 260,
            background: BRAND.white,
            border: `1px solid ${BRAND.grayBorder}`,
            borderRadius: 8,
            boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
            padding: '12px 14px',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: 12, color: BRAND.grayDark, lineHeight: 1.45, marginBottom: 10 }}>
            Are you sure you want to delete this contact? Related conversations and records may no longer show
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setContactDeleteId(null)}
              style={{ ...btnSmall, padding: '5px 10px' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const id = contactDeleteId;
                onRemoveContact(id);
                setContactDeleteId(null);
                if (selectedContact?.id === id) setSelectedContact(null);
              }}
              style={{
                ...btnSmall,
                padding: '5px 10px',
                background: BRAND.red,
                color: BRAND.white,
                borderColor: BRAND.red,
              }}
            >
              Delete
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const btnSmall: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: BRAND.grayLight, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const heroBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer' };
const iconBtn: React.CSSProperties = { width: 28, height: 28, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 5, background: BRAND.white, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

function ScrollSection({ id, title, subtitle, headerRight, actions, children }: { id?: string; title: string; subtitle?: string; headerRight?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div id={id} style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, marginBottom: 12, overflow: 'hidden', scrollMarginTop: 8 }}>
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

/** InfoField variant for the dark account hero panel. */
function DarkInfoField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.5 }}>{value || <span style={{ color: '#64748B', fontStyle: 'italic' }}>Not set</span>}</div>
    </div>
  );
}

function MemberTrackedExternalTable({
  title,
  rows,
  mode,
  customerId,
  onMarkedCandidManaged,
}: {
  title: string;
  rows: MemberExternalServiceAsset[];
  mode: 'document' | 'contract';
  customerId: string;
  onMarkedCandidManaged?: () => void;
}) {
  const [markingId, setMarkingId] = useState<string | null>(null);

  const markManaged = async (row: MemberExternalServiceAsset) => {
    if (markingId) return;
    const ok = window.confirm(
      `Mark “${row.name}” as Candid-managed?\n\nThis moves it out of savings opportunities and into My Services as an active Candid service.`,
    );
    if (!ok) return;
    setMarkingId(row.id);
    try {
      await markMemberServiceCandidManaged({ serviceId: row.id, customerId });
      onMarkedCandidManaged?.();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : 'Failed to mark as Candid-managed');
    } finally {
      setMarkingId(null);
    }
  };

  if (!rows.length) return null;
  return (
    <div className="member-tracked-external-block">
      <div className="member-tracked-external-head">
        <span className="member-tracked-external-badge">Not with Candid</span>
        <span className="member-tracked-external-title">{title}</span>
      </div>
      <table className="member-tracked-external-table">
        <thead>
          <tr>
            <th>{mode === 'document' ? 'File' : 'Service'}</th>
            <th>Provider</th>
            <th>Status</th>
            {mode === 'contract' && <th>Monthly</th>}
            <th>Uploaded by</th>
            <th>Date</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.name}</strong>
                {mode === 'document' && row.billStoragePath ? (
                  <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 3 }}>
                    {memberExternalFilename(row.billStoragePath, 'Bill upload')}
                  </div>
                ) : null}
                {mode === 'contract' && row.contractFilename ? (
                  <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 3 }}>{row.contractFilename}</div>
                ) : null}
              </td>
              <td>{row.vendor || '—'}</td>
              <td>{row.status.replace(/_/g, ' ')}</td>
              {mode === 'contract' && <td>{formatMemberExternalMonthly(row.monthlyAmountCents)}</td>}
              <td>{row.memberEmail || '—'}</td>
              <td>{new Date(row.createdAt).toLocaleDateString()}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button
                  type="button"
                  className="admin-ticket-btn"
                  disabled={markingId === row.id}
                  onClick={() => void markManaged(row)}
                  title="Convert to an active Candid-managed service"
                >
                  {markingId === row.id ? 'Updating…' : 'Mark as Candid-managed'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
                <button
                  type="button"
                  onClick={() => openDocumentViewer({ url: href, title: d.filename, filename: d.filename })}
                  style={{ color: BRAND.red, textDecoration: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                >
                  {d.filename}
                </button>
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

function ContractReminderMenuPortal({
  open,
  anchorEl,
  onClose,
  onSelect,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSelect: (kind: CustomerReminderKind) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setCoords(null);
      return;
    }

    const place = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = 168;
      let left = rect.right - menuWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      setCoords({ top: rect.bottom + 4, left });
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorEl?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, anchorEl, onClose]);

  if (!open || !anchorEl || !coords) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="contract-reminder-menu-portal"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        minWidth: 168,
      }}
      role="menu"
    >
      {(['task', 'reminder', 'calendar'] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          role="menuitem"
          className="contract-reminder-menu-item"
          onClick={() => onSelect(kind)}
        >
          {kind === 'task' ? 'Add task' : kind === 'reminder' ? 'Add reminder' : 'Add to calendar'}
        </button>
      ))}
    </div>,
    document.body,
  );
}

function MiniContractTable({
  contracts,
  documents,
  locations,
  showLocation,
  onEdit,
  selectedIds = [],
  onToggleSelect,
  onAddReminder,
  reminderMenuId,
  onReminderMenuToggle,
}: {
  contracts: CandidContractRecord[];
  documents: CustomerDocument[];
  locations: Location[];
  showLocation: boolean;
  onEdit: (c: CandidContractRecord) => void;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onAddReminder?: (kind: CustomerReminderKind, contract: CandidContractRecord) => void;
  reminderMenuId?: string | null;
  onReminderMenuToggle?: (id: string | null) => void;
}) {
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const openContract = reminderMenuId ? contracts.find((c) => c.id === reminderMenuId) : undefined;
  const selectable = Boolean(onToggleSelect);

  useLayoutEffect(() => {
    if (reminderMenuId && menuAnchorRef.current) {
      setMenuAnchorEl(menuAnchorRef.current);
    } else {
      setMenuAnchorEl(null);
    }
  }, [reminderMenuId]);

  if (!contracts.length) return <EmptyRow text="No contracts." />;
  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
      <thead>
        <tr style={{ background: BRAND.grayLight }}>
          {selectable ? <Th style={{ width: 40 }} center>{'\u00a0'}</Th> : null}
          <Th style={{ width: '28%', minWidth: 280 }}>Service</Th>
          <Th>Pay source</Th>
          <Th>Agent</Th>
          <Th>Rate</Th>
          <Th>MRR</Th>
          <Th>Candid comm</Th>
          <Th>Commission</Th>
          <Th>SPIFF</Th>
          <Th>Status</Th>
          {showLocation && <Th>Location</Th>}
          <Th>Deal ID</Th>
          <Th center>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {contracts.map((ct) => {
          const selected = selectedIds.includes(ct.id);
          const selectDisabled = !selected && selectedIds.length >= 2;
          return (
          <tr
            key={ct.id}
            style={{
              borderBottom: `1px solid ${BRAND.grayBorder}`,
              background: selected ? 'rgba(200,40,30,0.04)' : undefined,
            }}
          >
            {selectable ? (
              <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={selectDisabled}
                  onChange={() => onToggleSelect?.(ct.id)}
                  aria-label={`Select ${contractServiceTitle(ct)} for merge`}
                />
              </td>
            ) : null}
            <td style={{ padding: '10px 16px', width: '28%', minWidth: 280, verticalAlign: 'top' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => onEdit(ct)}
                    style={{ background: 'none', border: 'none', color: BRAND.red, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}
                  >
                    {contractServiceTitle(ct)}
                  </button>
                  {ct.solutionDescription ? (
                    <div
                      style={{ fontSize: 11, color: BRAND.gray, marginTop: 3, lineHeight: 1.4 }}
                      title={ct.solutionDescription}
                    >
                      {previewFirstWords(ct.solutionDescription, 15)}
                    </div>
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
                </div>
                <ContractDocumentLink contract={ct} documents={documents} />
              </div>
            </td>
            <td style={{ padding: '10px 16px', fontSize: 12 }}>{ct.paySource || '—'}</td>
            <td style={{ padding: '10px 16px', fontSize: 12 }}>{ct.agentOfRecord || '—'}</td>
            <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {ct.agentCommissionRate != null ? `${ct.agentCommissionRate}%` : '—'}
            </td>
            <td style={{ padding: '10px 16px' }}>
              {Number(ct.monthly) > 0
                ? `$${Number(ct.monthly).toLocaleString()}`
                : '—'}
            </td>
            <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {ct.candidCommissionRate != null ? `${ct.candidCommissionRate}%` : '—'}
            </td>
            <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {ct.commissionAmount != null
                ? `$${ct.commissionAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : ct.candidCommissionRate != null && ct.monthly
                  ? `$${(calcCandidCommissionAmount(ct.monthly, ct.candidCommissionRate) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
            </td>
            <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {ct.spiffExpected != null
                ? `$${ct.spiffExpected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'}
            </td>
            <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: ct.dealStatus === 'active' ? BRAND.green : BRAND.amber }}>{ct.dealStatus}</td>
            {showLocation && <td style={{ padding: '10px 16px', color: BRAND.gray, fontSize: 12 }}>{locationLabel(locations, ct.locationId)}</td>}
            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{ct.dealId || '—'}</td>
            <td style={{ padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', position: 'relative' }}>
                {onAddReminder && (
                    <button
                      type="button"
                      ref={reminderMenuId === ct.id ? menuAnchorRef : undefined}
                      onClick={() => onReminderMenuToggle?.(reminderMenuId === ct.id ? null : ct.id)}
                      style={iconBtn}
                      title="Add task, reminder, or calendar event"
                      aria-expanded={reminderMenuId === ct.id}
                      aria-haspopup="menu"
                    >
                      <BellIcon />
                    </button>
                )}
                <button type="button" onClick={() => onEdit(ct)} style={iconBtn} title="Edit contract"><EditIcon /></button>
              </div>
            </td>
          </tr>
          );
        })}
      </tbody>
      </table>
      {onAddReminder && (
        <ContractReminderMenuPortal
          open={Boolean(openContract)}
          anchorEl={menuAnchorEl}
          onClose={() => onReminderMenuToggle?.(null)}
          onSelect={(kind) => {
            if (openContract) onAddReminder(kind, openContract);
          }}
        />
      )}
    </>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 750, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
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
        {contact.altEmail ? (
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            <strong>Alt email:</strong>{' '}
            <a href={`mailto:${contact.altEmail}`} style={{ color: BRAND.blue }}>{contact.altEmail}</a>
          </div>
        ) : null}
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
          {onViewAsContact && (
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
