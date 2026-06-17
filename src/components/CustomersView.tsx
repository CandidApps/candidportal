'use client';

// Customers admin view — list + record drill-down.
// Self-contained: inline BRAND palette, types, sample data, and shared
// icons/components live in this file until they get split out.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CandidContractRecord, CustomerDocument, RecordKind } from '@/lib/customer-records';
import { RECORD_KIND_OPTIONS } from '@/lib/customer-records';
import {
  applyContractOverridesMap,
  filterHiddenContracts,
  hideContract,
} from '@/lib/customer-contract-overrides';
import {
  buildAllCustomerContracts,
  dedupeCustomerContractMap,
  mergeContractMaps,
} from '@/lib/customer-contracts-from-deals';
import { classifyMCC } from '@/lib/candid-pay/pricingEngine';
import { useCrmData } from '@/components/CrmDataProvider';
import type { CompanyAddressLookupResult } from '@/lib/services/company-address-lookup';
import {
  applyCustomerDocumentExtract,
  formatDocumentExtractNote,
  guessRecordKindFromFile,
  parseCustomerDocumentFromFile,
} from '@/lib/customer-document-extract';
import { CustomerRecordDetail } from '@/components/customers/CustomerRecordDetail';
import {
  ACCOUNT_LIST_TABS,
  ACCOUNTS_VIEW_BY,
  accountListTabForCustomer,
  customerHasExpiringContracts,
  filterCustomersForAccountTab,
  serviceStartForCustomer,
  sortCustomers,
  type AccountListTab,
  type AccountSortKey,
  type AccountsViewBy,
  type SortDir,
} from '@/components/customers/accounts-list-utils';
import {
  AccountsCommissionPartnerView,
  AccountsSupplierVendorView,
  AccountsAgentView,
} from '@/components/customers/AccountsPartnerViews';
import { EditContractModal } from '@/components/customers/EditContractModal';
import { EditDocumentModal } from '@/components/customers/EditDocumentModal';
import { ResolveCustomerActionModal, type ResolveActionSubmit } from '@/components/customers/ResolveCustomerActionModal';
import { AddCustomActionModal, type CustomActionDraft } from '@/components/customers/AddCustomActionModal';
import { CustomerHankChat } from '@/components/customers/CustomerHankChat';
import { applyActionResolutionToContracts } from '@/lib/customer-action-resolve';
import {
  addCustomCustomerAction,
  getResolvedActionsForCustomer,
  mergeCustomerActions,
  resolveCustomerAction,
} from '@/lib/customer-actions-store';
import type { CustomerAction } from '@/lib/portal-import/merge';
import type { HankActionResolvePayload } from '@/lib/customer-hank-chat';
import { PortalAccessFields } from '@/components/customers/PortalAccessFields';
import {
  grantFromContact,
  removePortalGrant,
  sendPortalInvite,
  upsertPortalGrant,
  type PortalAccessTier,
} from '@/lib/portal-access';
import {
  buildPortalImportDocuments,
  type CustomerPortalData,
} from '@/lib/portal-import/merge';

// ── BRAND ─────────────────────────────────────────────────────
const BRAND = {
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  grayDark: '#1E1E1E',
  grayMid: '#2D2D2D',
  gray: '#6B6B6B',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  white: '#FFFFFF',
  green: '#1A7A4A',
  amber: '#B45309',
  blue: '#1D4ED8',
} as const;

// ── TYPES ─────────────────────────────────────────────────────
export type CustomerStatus = 'active' | 'prospect' | 'inactive';
export type ContractStatus = 'active' | 'expiring' | 'expired';
export type FileType = 'contract' | 'invoice' | 'proposal' | 'statement' | 'other';

export interface Contact {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  ownershipPct?: number;
  locationIds?: string[];
  crmNotes?: string;
  recentEmails?: { subject: string; date: string }[];
  /** Member portal login for this contact */
  portalAccess?: boolean;
  portalAccessTier?: PortalAccessTier;
  portalInviteSentAt?: string;
}

export interface Location {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  isPrimary: boolean;
}

export interface Customer {
  id: string;
  company: string;
  companyLegal?: string;
  industry?: string;
  description?: string;
  website?: string;
  taxId?: string;
  mccCode?: string;
  corpType?: string;
  notes?: string;
  status: CustomerStatus;
  agent: string;
  spend: number;
  savings: number;
  contracts: number;
  files: number;
  since: string;
  contacts: Contact[];
  locations: Location[];
  /** Enriched from candid_portal_MASTER_import.json */
  portal?: CustomerPortalData;
}

export interface CustomerFile {
  id: string;
  filename: string;
  type: FileType;
  uploadedBy: string;
  date: string;
  size: string;
}

export interface ContractRow {
  service: string;
  vendor: string;
  monthly: number;
  expires: string;
  status: ContractStatus;
  autoRenews: boolean;
}

// ── HELPERS ───────────────────────────────────────────────────
function primaryContact(c: Customer): Contact | undefined {
  return c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];
}
function primaryLocation(c: Customer): Location | undefined {
  return c.locations.find((x) => x.isPrimary) ?? c.locations[0];
}
function formatLocation(loc?: Location): string {
  if (!loc) return '—';
  const cityState = [loc.city, loc.state].filter(Boolean).join(', ');
  return [loc.street, cityState, loc.zip].filter(Boolean).join(' · ');
}
const newId = () => `id-${Math.random().toString(36).slice(2, 10)}`;

// ── CUSTOMERS (loaded from Supabase via CrmDataProvider) ────

const LEGACY_SAMPLE_CUSTOMERS: Customer[] = [
  {
    id: 'c-acme',
    company: 'Acme Corporation',
    industry: 'Manufacturing & Logistics',
    website: 'https://acmecorp.com',
    taxId: '27-1934920',
    notes: 'Bryan owns this account. Renewal cluster sits in Q3 — UCaaS + ISP.',
    status: 'active',
    agent: 'Bryan Willis',
    spend: 4820,
    savings: 1715,
    contracts: 4,
    files: 12,
    since: 'Oct 2025',
    contacts: [
      { id: 'co-acme-1', name: 'John Mitchell',  role: 'Chief Executive Officer', email: 'john@acmecorp.com',    phone: '(555) 555-0101', isPrimary: true, locationIds: ['loc-acme-1'], crmNotes: 'Primary decision maker. Prefers email before calls.' },
      { id: 'co-acme-2', name: 'Rebecca Lee',    role: 'Chief Financial Officer', email: 'rebecca@acmecorp.com', phone: '(555) 555-0102', isPrimary: false, locationIds: ['loc-acme-1'] },
      { id: 'co-acme-3', name: 'Devon Patel',    role: 'IT Director',             email: 'devon@acmecorp.com',   phone: '(555) 555-0103', isPrimary: false, locationIds: ['loc-acme-2'] },
    ],
    locations: [
      { id: 'loc-acme-1', label: 'Headquarters',  street: '4220 N Kedzie Ave', city: 'Chicago', state: 'IL', zip: '60618', isPrimary: true },
      { id: 'loc-acme-2', label: 'Warehouse',     street: '1500 W Cermak Rd',  city: 'Chicago', state: 'IL', zip: '60608', isPrimary: false },
    ],
  },
  {
    id: 'c-paramount',
    company: 'Paramount Advertising and Lead S.',
    industry: 'Lead Generation & Performance Marketing',
    website: 'https://paramountleads.com',
    taxId: '36-4882011',
    status: 'active',
    agent: 'Bryan Willis',
    spend: 12980,
    savings: 3400,
    contracts: 3,
    files: 9,
    since: 'Jan 2026',
    contacts: [
      { id: 'co-par-1', name: 'Sarah Johnson', role: 'President',      email: 'sarah@paramountleads.com', phone: '(815) 555-0123', isPrimary: true },
      { id: 'co-par-2', name: 'Marcus Webb',   role: 'VP of Sales',    email: 'marcus@paramountleads.com', phone: '(815) 555-0124', isPrimary: false },
    ],
    locations: [
      { id: 'loc-par-1', label: 'Headquarters', street: '2200 E State St', city: 'Rockford', state: 'IL', zip: '61104', isPrimary: true },
    ],
  },
  {
    id: 'c-northpoint',
    company: 'Northpoint Dental Group',
    industry: 'Dental / Healthcare',
    website: 'https://northpointdental.com',
    taxId: '47-2210394',
    status: 'active',
    agent: 'Megan Cole',
    spend: 2310,
    savings: 540,
    contracts: 2,
    files: 6,
    since: 'Feb 2026',
    contacts: [
      { id: 'co-np-1', name: 'Dr. Lisa Hwang',  role: 'Owner / Lead Dentist', email: 'lisa@northpointdental.com',  phone: '(312) 555-0144', isPrimary: true },
      { id: 'co-np-2', name: 'Karen Mendez',    role: 'Office Manager',       email: 'karen@northpointdental.com', phone: '(312) 555-0145', isPrimary: false },
    ],
    locations: [
      { id: 'loc-np-1', label: 'Lincoln Park',  street: '2511 N Lincoln Ave', city: 'Chicago', state: 'IL', zip: '60614', isPrimary: true  },
      { id: 'loc-np-2', label: 'Lakeview',      street: '3358 N Halsted St',  city: 'Chicago', state: 'IL', zip: '60657', isPrimary: false },
    ],
  },
  {
    id: 'c-blueline',
    company: 'Blueline Logistics LLC',
    industry: 'Freight & Logistics',
    status: 'prospect',
    agent: 'Bryan Willis',
    spend: 0,
    savings: 0,
    contracts: 0,
    files: 1,
    since: 'May 2026',
    contacts: [
      { id: 'co-bl-1', name: 'Marcus Greene', role: 'Operations Manager', email: 'mgreene@bluelinelog.com', phone: '(720) 555-0177', isPrimary: true },
    ],
    locations: [
      { id: 'loc-bl-1', label: 'Headquarters', street: '4400 Joliet St', city: 'Denver', state: 'CO', zip: '80239', isPrimary: true },
    ],
  },
  {
    id: 'c-harbor',
    company: 'Harbor & Co. Wealth Advisors',
    industry: 'Financial Services / RIA',
    status: 'prospect',
    agent: 'Megan Cole',
    spend: 0,
    savings: 0,
    contracts: 0,
    files: 2,
    since: 'May 2026',
    contacts: [
      { id: 'co-hb-1', name: 'Priya Shah', role: 'Managing Partner', email: 'priya@harborwealth.com', phone: '(617) 555-0188', isPrimary: true },
    ],
    locations: [
      { id: 'loc-hb-1', label: 'Headquarters', street: '75 State St, 22nd Fl', city: 'Boston', state: 'MA', zip: '02109', isPrimary: true },
    ],
  },
  {
    id: 'c-old',
    company: 'Lakeside Roofing (Inactive)',
    industry: 'Construction / Trades',
    status: 'inactive',
    agent: 'Bryan Willis',
    spend: 0,
    savings: 0,
    contracts: 0,
    files: 4,
    since: 'Aug 2024',
    contacts: [
      { id: 'co-lk-1', name: 'Tom Rivera', role: 'Owner', email: 'tom@lakesideroof.com', phone: '(414) 555-0199', isPrimary: true },
    ],
    locations: [
      { id: 'loc-lk-1', label: 'Headquarters', street: '5500 W Lakeshore Dr', city: 'Milwaukee', state: 'WI', zip: '53202', isPrimary: true },
    ],
  },
];

const INITIAL_CUSTOMERS: Customer[] = [];

const CUSTOMER_FILES: Record<string, CustomerFile[]> = {
  'c-acme': [
    { id: 'f1', filename: 'RingCentral_Renewal_2026.pdf',    type: 'contract',  uploadedBy: 'Bryan Willis',   date: 'Apr 8, 2026',  size: '482 KB' },
    { id: 'f2', filename: 'Comcast_April_Invoice.pdf',       type: 'invoice',   uploadedBy: 'John Mitchell',  date: 'Apr 12, 2026', size: '128 KB' },
    { id: 'f3', filename: 'Microsoft_365_Proposal.pdf',      type: 'proposal',  uploadedBy: 'Megan Cole',     date: 'Apr 2, 2026',  size: '910 KB' },
    { id: 'f4', filename: 'Square_March_Statement.pdf',      type: 'statement', uploadedBy: 'Hank (AI)',      date: 'Apr 4, 2026',  size: '356 KB' },
  ],
  'c-paramount': [
    { id: 'f5', filename: 'Worldpay_Statement_Jan2026.pdf',     type: 'statement', uploadedBy: 'Sarah Johnson', date: 'Jan 31, 2026', size: '512 KB' },
    { id: 'f6', filename: 'Paramount_Processing_Proposal.pdf',  type: 'proposal',  uploadedBy: 'Bryan Willis',  date: 'Feb 4, 2026',  size: '624 KB' },
  ],
  'c-northpoint': [
    { id: 'f7', filename: 'AT&T_Dedicated_Line_Contract.pdf', type: 'contract', uploadedBy: 'Megan Cole', date: 'Feb 14, 2026', size: '301 KB' },
  ],
  'c-harbor': [
    { id: 'f8', filename: 'Harbor_Initial_Bills.zip', type: 'other', uploadedBy: 'Priya Shah', date: 'May 18, 2026', size: '1.8 MB' },
  ],
};

const CUSTOMER_CONTRACTS: Record<string, ContractRow[]> = {
  'c-acme': [
    { service: 'UCaaS / Phone System',  vendor: 'RingCentral — 25 seats',         monthly: 1250, expires: 'Jun 1, 2026',     status: 'expiring', autoRenews: true },
    { service: 'Internet Service',      vendor: 'Comcast Business — 500 Mbps',    monthly: 420,  expires: 'Jul 15, 2026',    status: 'expiring', autoRenews: false },
    { service: 'Merchant Processing',   vendor: 'Square — Effective rate 3.1%',   monthly: 1954, expires: 'Month-to-month',  status: 'active',   autoRenews: false },
    { service: 'Microsoft 365 Business',vendor: 'Direct — 22 licenses',           monthly: 660,  expires: 'Mar 2027',        status: 'active',   autoRenews: true },
  ],
  'c-paramount': [
    { service: 'Merchant Processing', vendor: 'Worldpay — Interchange Plus', monthly: 8420, expires: 'Month-to-month', status: 'active', autoRenews: false },
    { service: 'CCaaS',               vendor: 'Five9 — 12 seats',            monthly: 1900, expires: 'Sep 2026',       status: 'active', autoRenews: true },
    { service: 'Internet Service',    vendor: 'AT&T Fiber — 1 Gbps',         monthly: 460,  expires: 'Dec 2026',       status: 'active', autoRenews: true },
  ],
  'c-northpoint': [
    { service: 'Voice & Internet',     vendor: 'AT&T — Dedicated line', monthly: 1110, expires: 'Feb 2027', status: 'active', autoRenews: true },
    { service: 'Security (Endpoint)',  vendor: 'SentinelOne',           monthly: 360,  expires: 'Aug 2026', status: 'active', autoRenews: true },
  ],
};

function mergeDocumentMaps(
  ...maps: Record<string, CustomerDocument[]>[]
): Record<string, CustomerDocument[]> {
  const out: Record<string, CustomerDocument[]> = {};
  for (const map of maps) {
    for (const [customerId, docs] of Object.entries(map)) {
      out[customerId] = [...(out[customerId] ?? []), ...docs];
    }
  }
  return out;
}

function buildInitialDocuments(): Record<string, CustomerDocument[]> {
  const legacy: Record<string, CustomerDocument[]> = {};
  for (const [customerId, files] of Object.entries(CUSTOMER_FILES)) {
    const customer = INITIAL_CUSTOMERS.find((c) => c.id === customerId);
    const primaryId = customer?.locations.find((l) => l.isPrimary)?.id ?? customer?.locations[0]?.id ?? '';
    legacy[customerId] = files.map((f) => ({
      id: f.id,
      customerId,
      locationId: primaryId,
      filename: f.filename,
      recordKind:
        f.type === 'invoice' ? 'invoice'
        : f.type === 'proposal' ? 'proposal'
        : f.type === 'statement' ? 'statement'
        : f.type === 'contract' ? 'candid_contract'
        : 'other',
      uploadedBy: f.uploadedBy,
      date: f.date,
      size: f.size,
    }));
  }
  const portal = buildPortalImportDocuments(INITIAL_CUSTOMERS);
  return mergeDocumentMaps(legacy, portal);
}

function buildLegacyContracts(): Record<string, CandidContractRecord[]> {
  const out: Record<string, CandidContractRecord[]> = {};
  for (const [customerId, rows] of Object.entries(CUSTOMER_CONTRACTS)) {
    const customer = INITIAL_CUSTOMERS.find((c) => c.id === customerId);
    const primaryId = customer?.locations.find((l) => l.isPrimary)?.id ?? customer?.locations[0]?.id ?? '';
    out[customerId] = rows.map((r, i) => ({
      id: `ct-${customerId}-${i}`,
      customerId,
      locationId: primaryId,
      vendor: r.vendor,
      service: r.service,
      monthly: r.monthly,
      expires: r.expires,
      dealStatus: r.status === 'expiring' ? 'expiring' : r.status === 'expired' ? 'expired' : 'active',
      autoRenews: r.autoRenews,
      physicalLocationId: primaryId,
      billingLocationId: primaryId,
    }));
  }
  return out;
}

function buildInitialContracts(customers: Customer[]): Record<string, CandidContractRecord[]> {
  return applyContractOverridesMap(
    dedupeCustomerContractMap(
      mergeContractMaps(
        buildLegacyContracts(),
        buildAllCustomerContracts(customers),
      ),
    ),
  );
}

const TYPE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  contract:  { color: BRAND.blue,  bg: '#EFF6FF', label: 'Contract' },
  invoice:   { color: BRAND.amber, bg: '#FEF3C7', label: 'Invoice' },
  proposal:  { color: BRAND.green, bg: '#EAF7F0', label: 'Proposal' },
  statement: { color: BRAND.gray,  bg: '#F1F5F9', label: 'Statement' },
  other:     { color: BRAND.gray,  bg: '#F1F5F9', label: 'Other' },
};

// ── ICONS (inline so this view stays self-contained) ──────────
const iconBase = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const PlusIcon         = () => (<svg {...iconBase}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const SearchIcon       = () => (<svg {...iconBase}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);
const EyeIcon          = () => (<svg {...iconBase}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
const UploadIcon       = () => (<svg {...iconBase}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
const TrashIcon        = () => (<svg {...iconBase}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
const ExternalLinkIcon = () => (<svg {...iconBase}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>);
const ChevronLeftIcon  = () => (<svg {...iconBase}><polyline points="15 18 9 12 15 6" /></svg>);
const EditIcon         = () => (<svg {...iconBase}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);
const MapPinIcon       = () => (<svg {...iconBase}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);
const UserIcon         = () => (<svg {...iconBase}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
const StarIcon         = ({ filled }: { filled?: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? BRAND.amber : 'none'} stroke={BRAND.amber} strokeWidth={1.6} strokeLinejoin="round">
    <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.5 12 2" />
  </svg>
);

const DocumentIcon: React.FC<{ color?: string }> = ({ color = BRAND.gray }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

// ── Shared pills / buttons ────────────────────────────────────
const PrimaryBtn: React.FC<{ onClick?: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: `linear-gradient(135deg, ${BRAND.redDark}, ${BRAND.redLight})`,
      color: BRAND.white, border: 'none', borderRadius: 6,
      padding: '9px 16px', fontFamily: "'DM Sans', sans-serif",
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      letterSpacing: '0.02em',
    }}
  >
    {children}
  </button>
);

const SecondaryBtn: React.FC<{ onClick?: () => void; children: React.ReactNode; light?: boolean }> = ({ onClick, children, light }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: light ? BRAND.white : 'rgba(255,255,255,0.08)',
      color: light ? BRAND.grayDark : BRAND.white,
      border: light ? `1px solid ${BRAND.grayBorder}` : '1px solid rgba(255,255,255,0.1)',
      borderRadius: 6, padding: '9px 16px',
      fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
      cursor: 'pointer',
    }}
  >
    {children}
  </button>
);

const ActionBtn: React.FC<{
  onClick?: () => void;
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, danger, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: BRAND.white,
      border: `1px solid ${BRAND.grayBorder}`,
      borderRadius: 5,
      color: danger ? BRAND.red : BRAND.gray,
      cursor: 'pointer', padding: 0,
    }}
    onMouseOver={(e) => (e.currentTarget.style.background = BRAND.grayLight)}
    onMouseOut={(e) => (e.currentTarget.style.background = BRAND.white)}
  >
    {children}
  </button>
);

const ContractStatusPill: React.FC<{ status: ContractStatus }> = ({ status }) => {
  const map: Record<ContractStatus, { bg: string; color: string; label: string }> = {
    active:   { bg: '#EAF7F0', color: BRAND.green, label: 'Active' },
    expiring: { bg: '#FEE2E2', color: BRAND.red,   label: 'Expiring' },
    expired:  { bg: '#F1F5F9', color: BRAND.gray,  label: 'Expired' },
  };
  const s = map[status];
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// Customers View — List + Record Drill-down
// ─────────────────────────────────────────────────────────────
export const CustomersView: React.FC<{
  onViewAsContact?: (contact: Contact, customer: Customer) => void;
  selectedId?: string | null;
  onSelectedIdChange?: (id: string | null) => void;
}> = ({ onViewAsContact, selectedId: selectedIdProp, onSelectedIdChange }) => {
  const {
    customers: crmCustomers,
    documentsByCustomerId: crmDocuments,
    contractsByCustomerId: crmContracts,
    loading: crmLoading,
    error: crmError,
  } = useCrmData();
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [activeTab, setActiveTab] = useState<AccountListTab>('active_recurring');
  const [viewBy, setViewBy] = useState<AccountsViewBy>('customer');
  const [sortKey, setSortKey] = useState<AccountSortKey>('company');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selectedIdInternal, setSelectedIdInternal] = useState<string | null>(null);
  const selectedId = selectedIdProp !== undefined ? selectedIdProp : selectedIdInternal;
  const setSelectedId = (id: string | null) => {
    if (onSelectedIdChange) onSelectedIdChange(id);
    else setSelectedIdInternal(id);
  };
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [customerDocuments, setCustomerDocuments] = useState<Record<string, CustomerDocument[]>>(buildInitialDocuments);
  const [customerContracts, setCustomerContracts] = useState<Record<string, CandidContractRecord[]>>(() =>
    buildInitialContracts(INITIAL_CUSTOMERS),
  );
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!crmCustomers.length) return;
    setCustomers(crmCustomers);
    if (Object.keys(crmDocuments).length) {
      setCustomerDocuments((prev) => ({ ...prev, ...crmDocuments }));
    }
    if (Object.keys(crmContracts).length) {
      setCustomerContracts(
        applyContractOverridesMap(dedupeCustomerContractMap(crmContracts)),
      );
    }
  }, [crmCustomers, crmDocuments, crmContracts]);

  useEffect(() => {
    const refreshDealContracts = () => {
      setCustomerContracts((prev) => {
        const fromDeals = applyContractOverridesMap(
          dedupeCustomerContractMap(
            mergeContractMaps(buildLegacyContracts(), buildAllCustomerContracts(customers)),
          ),
        );
        const merged = fromDeals;
        const manual: Record<string, CandidContractRecord[]> = {};
        for (const [customerId, contracts] of Object.entries(prev)) {
          manual[customerId] = filterHiddenContracts(
            contracts.filter((c) => !c.id.startsWith('ct-bmw-')),
          );
        }
        return applyContractOverridesMap(
          dedupeCustomerContractMap(mergeContractMaps(manual, merged)),
        );
      });
    };
    refreshDealContracts();
    window.addEventListener('candid-commissions-updated', refreshDealContracts);
    window.addEventListener('candid-contract-updated', refreshDealContracts);
    return () => {
      window.removeEventListener('candid-commissions-updated', refreshDealContracts);
      window.removeEventListener('candid-contract-updated', refreshDealContracts);
    };
  }, [customers]);

  const handleSearch = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
    if (!val.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = val.toLowerCase();
    const matches = customers.filter((c) => {
      const pc = primaryContact(c);
      return (
        c.company.toLowerCase().includes(q) ||
        (pc?.name.toLowerCase().includes(q) ?? false) ||
        (pc?.email.toLowerCase().includes(q) ?? false)
      );
    });
    setSuggestions(matches.slice(0, 8));
    setShowSuggestions(true);
  };

  const filteredCustomers = useMemo(
    () => {
      const byTab = filterCustomersForAccountTab(customers, activeTab, customerContracts);
      const q = search.toLowerCase();
      if (!q) return byTab;
      return byTab.filter((c) => {
        const pc = primaryContact(c);
        return (
          c.company.toLowerCase().includes(q) ||
          c.agent.toLowerCase().includes(q) ||
          (pc?.name.toLowerCase().includes(q) ?? false) ||
          (pc?.email.toLowerCase().includes(q) ?? false)
        );
      });
    },
    [customers, activeTab, customerContracts, search],
  );

  const sortedCustomers = useMemo(
    () => sortCustomers(filteredCustomers, sortKey, sortDir, customerContracts),
    [filteredCustomers, sortKey, sortDir, customerContracts],
  );

  const handleSort = (key: AccountSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'spend' || key === 'serviceStart' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / perPage));
  const pageClamped = Math.min(currentPage, totalPages);
  const paged = sortedCustomers.slice((pageClamped - 1) * perPage, pageClamped * perPage);

  const stats = useMemo(
    () => ({
      active_recurring: customers.filter((c) => accountListTabForCustomer(c) === 'active_recurring').length,
      non_recurring: customers.filter((c) => accountListTabForCustomer(c) === 'non_recurring').length,
      inactive: customers.filter((c) => accountListTabForCustomer(c) === 'inactive').length,
      expiring: customers.filter((c) =>
        customerHasExpiringContracts(c, customerContracts[c.id] ?? []),
      ).length,
      monthly: customers.reduce((s, c) => s + c.spend, 0),
    }),
    [customers, customerContracts],
  );

  const selectedCustomer = useMemo(
    () => (selectedId ? customers.find((c) => c.id === selectedId) ?? null : null),
    [customers, selectedId]
  );

  const updateCustomer = (id: string, patch: Partial<Customer>) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const upsertContact = (customerId: string, contact: Contact) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        const exists = c.contacts.some((x) => x.id === contact.id);
        let next = exists
          ? c.contacts.map((x) => (x.id === contact.id ? contact : x))
          : [...c.contacts, contact];
        if (contact.isPrimary) {
          next = next.map((x) => ({ ...x, isPrimary: x.id === contact.id }));
        } else if (!next.some((x) => x.isPrimary)) {
          next = next.map((x, i) => ({ ...x, isPrimary: i === 0 }));
        }
        return { ...c, contacts: next };
      })
    );
  };

  const removeContact = (customerId: string, contactId: string) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        let next = c.contacts.filter((x) => x.id !== contactId);
        if (next.length > 0 && !next.some((x) => x.isPrimary)) {
          next = next.map((x, i) => ({ ...x, isPrimary: i === 0 }));
        }
        return { ...c, contacts: next };
      })
    );
  };

  const upsertLocation = (customerId: string, location: Location) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        const exists = c.locations.some((x) => x.id === location.id);
        let next = exists
          ? c.locations.map((x) => (x.id === location.id ? location : x))
          : [...c.locations, location];
        if (location.isPrimary) {
          next = next.map((x) => ({ ...x, isPrimary: x.id === location.id }));
        } else if (!next.some((x) => x.isPrimary)) {
          next = next.map((x, i) => ({ ...x, isPrimary: i === 0 }));
        }
        return { ...c, locations: next };
      })
    );
  };

  const removeLocation = (customerId: string, locationId: string) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        let next = c.locations.filter((x) => x.id !== locationId);
        if (next.length > 0 && !next.some((x) => x.isPrimary)) {
          next = next.map((x, i) => ({ ...x, isPrimary: i === 0 }));
        }
        return { ...c, locations: next };
      })
    );
  };

  if (selectedCustomer) {
    const cid = selectedCustomer.id;
    return (
      <CustomerRecordWithModals
        customer={customers.find((x) => x.id === cid) ?? selectedCustomer}
        documents={customerDocuments[cid] ?? []}
        contracts={customerContracts[cid] ?? []}
        onBack={() => setSelectedId(null)}
        onUpdateCustomer={(patch) => updateCustomer(cid, patch)}
        onUpsertContact={(c) => upsertContact(cid, c)}
        onRemoveContact={(id) => removeContact(cid, id)}
        onUpsertLocation={(l) => upsertLocation(cid, l)}
        onRemoveLocation={(id) => removeLocation(cid, id)}
        onDocumentsChange={(docs) => setCustomerDocuments((prev) => ({ ...prev, [cid]: docs }))}
        onContractsChange={(contracts) => setCustomerContracts((prev) => ({ ...prev, [cid]: contracts }))}
        onViewAsContact={onViewAsContact ? (contact) => onViewAsContact(contact, customers.find((x) => x.id === cid) ?? selectedCustomer) : undefined}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ACCOUNTS_VIEW_BY.map((opt) => (
            <PillBtn
              key={opt.id}
              label={opt.label}
              active={viewBy === opt.id}
              onClick={() => { setViewBy(opt.id); setCurrentPage(1); }}
            />
          ))}
        </div>
        <PrimaryBtn onClick={() => setAddCustomerOpen(true)}>
          <PlusIcon /> Add Account
        </PrimaryBtn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Active Recurring" value={stats.active_recurring} sub="Recurring MRC" onClick={() => setActiveTab('active_recurring')} accent={BRAND.green} />
        <StatCard label="Non Recurring" value={stats.non_recurring} sub="Prospects & one-time" onClick={() => setActiveTab('non_recurring')} accent={BRAND.amber} />
        <StatCard label="Inactive" value={stats.inactive} sub="No active deals" onClick={() => setActiveTab('inactive')} accent={BRAND.gray} />
        <StatCard label="Expiring Contracts" value={stats.expiring} sub="Next 90 days" onClick={() => setActiveTab('expiring_contracts')} accent={BRAND.amber} />
        <StatCard label="Monthly Under Mgmt" value={`$${(stats.monthly / 1000).toFixed(1)}K`} sub="Across all accounts" accent={BRAND.blue} />
      </div>

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${BRAND.grayBorder}`, padding: '0 20px' }}>
          {ACCOUNT_LIST_TABS.map((tab) => (
            <TabBtn
              key={tab.id}
              label={tab.label}
              active={activeTab === tab.id}
              onClick={() => { setActiveTab(tab.id); setCurrentPage(1); }}
            />
          ))}
          <div style={{ marginLeft: 'auto', position: 'relative', padding: '10px 0' }} ref={searchRef}>
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: BRAND.gray }}>
              <SearchIcon />
            </div>
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search accounts..."
              style={{
                padding: '8px 12px 8px 32px', border: `1px solid ${BRAND.grayBorder}`,
                borderRadius: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                color: BRAND.grayDark, width: 240, outline: 'none',
              }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`,
                borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                zIndex: 100, maxHeight: 240, overflowY: 'auto',
              }}>
                {suggestions.map((c) => {
                  const pc = primaryContact(c);
                  return (
                    <div
                      key={c.id}
                      onClick={() => { setSelectedId(c.id); setShowSuggestions(false); }}
                      style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${BRAND.grayBorder}` }}
                      onMouseOver={(e) => (e.currentTarget.style.background = BRAND.grayLight)}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: 6, background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: BRAND.white, flexShrink: 0 }}>
                        {c.company.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark }}>{c.company}</div>
                        <div style={{ fontSize: 11, color: BRAND.gray }}>{pc?.name ?? '—'} — {c.status}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {viewBy === 'customer' ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: BRAND.grayLight }}>
              <SortableTh label="Account Name" sortKey="company" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label="Sales Agent" sortKey="agent" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label="Monthly Spend" sortKey="spend" current={sortKey} dir={sortDir} onSort={handleSort} right />
              <SortableTh label="Service Start Date" sortKey="serviceStart" current={sortKey} dir={sortDir} onSort={handleSort} />
              <Th center>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c) => (
              <CustomerRow
                key={c.id}
                customer={c}
                serviceStart={serviceStartForCustomer(c, customerContracts[c.id] ?? []).display}
                onOpen={() => setSelectedId(c.id)}
              />
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: BRAND.gray }}>No accounts found.</td></tr>
            )}
          </tbody>
        </table>
        ) : viewBy === 'commission_partner' ? (
          <AccountsCommissionPartnerView
            customers={customers}
            accountTab={activeTab}
            contractsByCustomer={customerContracts}
            search={search}
            onOpenCustomer={setSelectedId}
          />
        ) : viewBy === 'supplier_vendor' ? (
          <AccountsSupplierVendorView
            customers={customers}
            accountTab={activeTab}
            contractsByCustomer={customerContracts}
            search={search}
            onOpenCustomer={setSelectedId}
          />
        ) : (
          <AccountsAgentView
            customers={customers}
            accountTab={activeTab}
            contractsByCustomer={customerContracts}
            search={search}
            onOpenCustomer={setSelectedId}
          />
        )}

        {viewBy === 'customer' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16, borderTop: `1px solid ${BRAND.grayBorder}` }}>
          <PageBtn onClick={() => setCurrentPage(1)}>«</PageBtn>
          <PageBtn onClick={() => setCurrentPage(Math.max(1, pageClamped - 1))}>‹</PageBtn>
          <span style={{ fontSize: 12, color: BRAND.gray, padding: '0 8px' }}>
            Page {pageClamped} of {totalPages} ({sortedCustomers.length} records)
          </span>
          <PageBtn onClick={() => setCurrentPage(Math.min(totalPages, pageClamped + 1))}>›</PageBtn>
          <PageBtn onClick={() => setCurrentPage(totalPages)}>»</PageBtn>
          <select
            value={perPage}
            onChange={(e) => { setPerPage(+e.target.value); setCurrentPage(1); }}
            style={{ marginLeft: 8, padding: '5px 8px', border: `1px solid ${BRAND.grayBorder}`, borderRadius: 4, fontFamily: "'DM Sans',sans-serif", fontSize: 12 }}
          >
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        )}
      </div>

      {addCustomerOpen && (
        <AddCustomerModal
          onClose={() => setAddCustomerOpen(false)}
          onSave={(customer, initialDocument) => {
            setCustomers((prev) => [customer, ...prev]);
            if (initialDocument) {
              setCustomerDocuments((prev) => ({
                ...prev,
                [customer.id]: [initialDocument, ...(prev[customer.id] ?? [])],
              }));
            }
            setAddCustomerOpen(false);
          }}
        />
      )}
    </div>
  );
};

// ── Stat Card ─────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string;
  value: number | string;
  sub: string;
  onClick?: () => void;
  accent?: string;
}> = ({ label, value, sub, onClick, accent }) => (
  <div
    onClick={onClick}
    style={{
      background: BRAND.white,
      border: `1px solid ${BRAND.grayBorder}`,
      borderLeft: accent ? `3px solid ${accent}` : undefined,
      borderRadius: 8,
      padding: '14px 18px',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.15s',
    }}
    onMouseOver={(e) => onClick && (e.currentTarget.style.borderColor = accent || BRAND.red)}
    onMouseOut={(e) => onClick && (e.currentTarget.style.borderColor = BRAND.grayBorder)}
  >
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent || BRAND.gray, marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: BRAND.grayDark }}>{value}</div>
    <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>{sub}</div>
  </div>
);

const PillBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: '8px 16px',
      borderRadius: 20,
      border: `1px solid ${active ? BRAND.red : BRAND.grayBorder}`,
      background: active ? 'rgba(200,40,30,0.08)' : BRAND.white,
      color: active ? BRAND.red : BRAND.gray,
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 12,
      fontWeight: active ? 600 : 500,
      cursor: 'pointer',
    }}
  >
    {label}
  </button>
);

const SortableTh: React.FC<{
  label: string;
  sortKey: AccountSortKey;
  current: AccountSortKey;
  dir: SortDir;
  onSort: (key: AccountSortKey) => void;
  center?: boolean;
  right?: boolean;
}> = ({ label, sortKey, current, dir, onSort, center, right }) => {
  const active = current === sortKey;
  const arrow = active ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '11px 16px',
        textAlign: center ? 'center' : right ? 'right' : 'left',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: active ? BRAND.red : BRAND.gray,
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}{arrow}
    </th>
  );
};

const TabBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '14px 20px', background: 'transparent', border: 'none',
      borderBottom: `2px solid ${active ? BRAND.red : 'transparent'}`,
      fontFamily: "'DM Sans', sans-serif", fontSize: 13,
      fontWeight: active ? 600 : 500, color: active ? BRAND.red : BRAND.gray,
      cursor: 'pointer', marginBottom: -1,
    }}
  >
    {label}
  </button>
);

const Th: React.FC<{ children: React.ReactNode; center?: boolean; right?: boolean }> = ({ children, center, right }) => (
  <th style={{ padding: '11px 16px', textAlign: center ? 'center' : right ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.gray }}>
    {children}
  </th>
);

const PageBtn: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} style={{ padding: '6px 10px', border: `1px solid ${BRAND.grayBorder}`, borderRadius: 4, background: BRAND.white, cursor: 'pointer', fontSize: 12 }}>
    {children}
  </button>
);

const CustomerRow: React.FC<{ customer: Customer; serviceStart: string; onOpen: () => void }> = ({ customer: c, serviceStart, onOpen }) => {
  const [hovered, setHovered] = useState(false);
  const pc = primaryContact(c);
  const urgentActions = c.portal?.actions.filter((a) => a.severity === 'urgent').length ?? 0;
  const soonActions = c.portal?.actions.filter((a) => a.severity === 'soon').length ?? 0;
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: `1px solid ${BRAND.grayBorder}`, background: hovered ? BRAND.grayLight : 'transparent', cursor: 'pointer' }}
    >
      <td style={{ padding: '13px 16px' }} onClick={onOpen}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: BRAND.red, textDecoration: 'underline', textUnderlineOffset: 2 }}>{c.company}</span>
          {urgentActions > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: BRAND.red, background: '#FEE2E2', padding: '2px 7px', borderRadius: 20 }}>
              {urgentActions} renewal{urgentActions === 1 ? '' : 's'}
            </span>
          )}
          {soonActions > 0 && urgentActions === 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: BRAND.amber, background: '#FEF3C7', padding: '2px 7px', borderRadius: 20 }}>
              {soonActions} upcoming
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: BRAND.gray }}>{pc?.name ?? '—'} · {pc?.email ?? '—'}</div>
      </td>
      <td style={{ padding: '13px 16px', color: BRAND.gray }}>{c.agent}</td>
      <td style={{ padding: '13px 16px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: BRAND.grayDark }}>
        {c.spend > 0 ? `$${c.spend.toLocaleString()}/mo` : '—'}
      </td>
      <td style={{ padding: '13px 16px', color: BRAND.gray, fontSize: 12 }}>{serviceStart}</td>
      <td style={{ padding: '13px 16px' }}>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
          <ActionBtn onClick={onOpen} title="Open Record"><EyeIcon /></ActionBtn>
          <ActionBtn onClick={onOpen} title="Upload File"><UploadIcon /></ActionBtn>
          <ActionBtn title="External Link"><ExternalLinkIcon /></ActionBtn>
          <ActionBtn danger title="Delete"><TrashIcon /></ActionBtn>
        </div>
      </td>
    </tr>
  );
};

// ─────────────────────────────────────────────────────────────
// SECTION CARD WRAPPER
// ─────────────────────────────────────────────────────────────
const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, actions, children }) => (
  <div style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BRAND.grayBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grayDark }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions}
    </div>
    {children}
  </div>
);

const Field: React.FC<{ label: string; value?: string; block?: boolean }> = ({ label, value, block }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 13, color: BRAND.grayDark, lineHeight: block ? 1.55 : 1.4 }}>{value || <span style={{ color: BRAND.gray, fontStyle: 'italic' }}>Not set</span>}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// MODAL OVERLAY + FORM ELEMENTS
// ─────────────────────────────────────────────────────────────
const ModalOverlay: React.FC<{ onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ onClose, children, wide }) => (
  <div
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: 16 }}
  >
    <div style={{ background: BRAND.white, borderRadius: 14, width: wide ? 720 : 560, maxWidth: '95vw', maxHeight: '92vh', boxShadow: '0 24px 80px rgba(0,0,0,0.28)', overflow: 'hidden', animation: 'modalIn 0.25s ease forwards', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  </div>
);

const FormSectionTitle: React.FC<{ children: React.ReactNode; first?: boolean }> = ({ children, first }) => (
  <div style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray,
    margin: first ? '0 0 10px' : '20px 0 10px', paddingTop: first ? 0 : 6,
    borderTop: first ? 'none' : `1px solid ${BRAND.grayBorder}`,
  }}>
    {children}
  </div>
);

const ModalHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; onClose: () => void }> = ({ icon, title, subtitle, onClose }) => (
  <div style={{ background: BRAND.grayDark, padding: '20px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})` }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`, color: BRAND.white, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: BRAND.white }}>{title}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{subtitle}</div>
      </div>
    </div>
    <button onClick={onClose} style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
  </div>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: BRAND.gray, letterSpacing: '0.06em', marginBottom: 5 }}>{children}</label>
);

const inputStyle: React.CSSProperties = {
  width: '100%', border: `1px solid ${BRAND.grayBorder}`, borderRadius: 6,
  padding: '10px 12px', fontFamily: "'DM Sans',sans-serif", fontSize: 13,
  color: BRAND.grayDark, outline: 'none', boxSizing: 'border-box',
};

const FormFooter: React.FC<{ onCancel: () => void; onSave: () => void; saveLabel?: string }> = ({ onCancel, onSave, saveLabel = 'Save Changes' }) => (
  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
    <button
      type="button"
      onClick={onCancel}
      style={{ background: BRAND.grayLight, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 7, padding: '11px 18px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: BRAND.grayDark, cursor: 'pointer' }}
    >
      Cancel
    </button>
    <button
      type="button"
      onClick={onSave}
      style={{ background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`, color: BRAND.white, border: 'none', borderRadius: 7, padding: '11px 22px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
    >
      {saveLabel}
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────
// ADD CUSTOMER MODAL
// ─────────────────────────────────────────────────────────────
type DraftContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  ownershipPct: string;
  portalAccess: boolean;
  portalAccessTier: PortalAccessTier;
  locationIds: string[];
};
type DraftLocation = { id: string; label: string; street: string; city: string; state: string; zip: string };

const emptyDraftContact = (): DraftContact => ({
  id: newId(),
  name: '',
  email: '',
  phone: '',
  role: '',
  ownershipPct: '',
  portalAccess: false,
  portalAccessTier: 'trial',
  locationIds: [],
});
const emptyDraftLocation = (): DraftLocation => ({ id: newId(), label: '', street: '', city: '', state: '', zip: '' });

type AddressLookupStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error';

function applyCompanyLookup(
  result: CompanyAddressLookupResult,
  opts: {
    addressEdited: boolean;
    setStreet: (v: string) => void;
    setCity: (v: string) => void;
    setState: (v: string) => void;
    setZip: (v: string) => void;
    setCompanyFriendly: React.Dispatch<React.SetStateAction<string>>;
    setCompanyLegal: React.Dispatch<React.SetStateAction<string>>;
    setIndustry: React.Dispatch<React.SetStateAction<string>>;
    setDescription: React.Dispatch<React.SetStateAction<string>>;
    setMccCode: React.Dispatch<React.SetStateAction<string>>;
  },
): { addressFound: boolean; profileFound: boolean } {
  if (result.source === 'none') return { addressFound: false, profileFound: false };

  if (!opts.addressEdited) {
    if (result.street) opts.setStreet(result.street);
    if (result.city) opts.setCity(result.city);
    if (result.state) opts.setState(result.state);
    if (result.zip) opts.setZip(result.zip);
  }
  if (result.companyName) {
    opts.setCompanyFriendly((prev) => (prev.trim() ? prev : result.companyName!));
    opts.setCompanyLegal((prev) => (prev.trim() ? prev : result.companyName!));
  }
  if (result.industry) {
    opts.setIndustry((prev) => (prev.trim() ? prev : result.industry!));
  }
  if (result.description) {
    opts.setDescription((prev) => (prev.trim() ? prev : result.description!));
  }
  if (result.mccCode) {
    opts.setMccCode((prev) => (prev.trim() ? prev : result.mccCode!));
  }

  const addressFound = Boolean(result.street || result.city || result.state || result.zip);
  const profileFound = Boolean(result.industry || result.description || result.mccCode || result.companyName);
  return { addressFound, profileFound };
}

function formatLookupNote(
  result: CompanyAddressLookupResult,
  opts: { addressEdited: boolean; addressFound: boolean; profileFound: boolean },
): string {
  const sourceLabel = result.source === 'ai' ? 'AI + website content' : 'website data';
  const foundParts: string[] = [];
  if (opts.addressFound) foundParts.push('address');
  if (result.industry) foundParts.push('industry');
  if (result.description) foundParts.push('description');
  if (result.mccCode) foundParts.push('MCC code');

  if (!foundParts.length) {
    return 'No company profile found on that website. You can enter details manually.';
  }

  const summary = `Found ${foundParts.join(', ')} via ${sourceLabel}`;
  if (opts.addressEdited && opts.addressFound) {
    return `${summary}. Address fields were left unchanged because you already edited them — please verify everything before saving.`;
  }
  return `${summary} — please verify before saving.`;
}

type DocumentParseStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error';

const AddCustomerModal: React.FC<{
  onClose: () => void;
  onSave: (customer: Customer, initialDocument?: CustomerDocument) => void;
}> = ({ onClose, onSave }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [recordKind, setRecordKind] = useState<RecordKind>('external_contract');
  const [docParseStatus, setDocParseStatus] = useState<DocumentParseStatus>('idle');
  const [docParseNote, setDocParseNote] = useState('');
  const [companyFriendly, setCompanyFriendly] = useState('');
  const [companyLegal, setCompanyLegal] = useState('');
  const [website, setWebsite] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [ein, setEin] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [mccCode, setMccCode] = useState('');
  const [corpType, setCorpType] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [ownershipPct, setOwnershipPct] = useState('');
  const [primaryPortalAccess, setPrimaryPortalAccess] = useState(false);
  const [primaryPortalTier, setPrimaryPortalTier] = useState<PortalAccessTier>('trial');
  const [primaryPortalLocationIds, setPrimaryPortalLocationIds] = useState<string[]>([]);
  const [otherContacts, setOtherContacts] = useState<DraftContact[]>([]);
  const [otherLocations, setOtherLocations] = useState<DraftLocation[]>([]);
  const [lookupStatus, setLookupStatus] = useState<AddressLookupStatus>('idle');
  const [lookupNote, setLookupNote] = useState('');
  const addressEditedRef = useRef(false);
  const lastLookupUrlRef = useRef('');
  const PRIMARY_DRAFT_LOC_ID = 'draft-primary-loc';

  const draftLocations = useMemo((): Location[] => {
    const locs: Location[] = [];
    if (street.trim() || city.trim()) {
      locs.push({
        id: PRIMARY_DRAFT_LOC_ID,
        label: 'Primary',
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        isPrimary: true,
      });
    }
    otherLocations.forEach((loc) => {
      if (!loc.street.trim() && !loc.city.trim()) return;
      locs.push({
        id: loc.id,
        label: loc.label.trim() || 'Location',
        street: loc.street.trim(),
        city: loc.city.trim(),
        state: loc.state.trim(),
        zip: loc.zip.trim(),
        isPrimary: false,
      });
    });
    return locs;
  }, [street, city, state, zip, otherLocations]);

  const mapDraftLocationIds = (ids: string[], primaryRealId: string | null): string[] =>
    ids.map((id) => (id === PRIMARY_DRAFT_LOC_ID && primaryRealId ? primaryRealId : id));

  const markAddressEdited = () => {
    addressEditedRef.current = true;
  };

  const draftValues = (): import('@/lib/customer-document-extract').CustomerDraftValues => ({
    companyFriendly,
    companyLegal,
    website,
    street,
    city,
    state,
    zip,
    ein,
    industry,
    description,
    mccCode,
    corpType,
    contactName,
    contactEmail,
    contactPhone,
    contactRole,
  });

  const draftSetters = () => ({
    addressEdited: addressEditedRef.current,
    setCompanyFriendly,
    setCompanyLegal,
    setWebsite,
    setStreet,
    setCity,
    setState,
    setZip,
    setEin,
    setIndustry,
    setDescription,
    setMccCode,
    setCorpType,
    setContactName,
    setContactEmail,
    setContactPhone,
    setContactRole,
  });

  const runDocumentExtract = async (file: File) => {
    setDocParseStatus('loading');
    setDocParseNote('Reading document and extracting company info…');
    try {
      const result = await parseCustomerDocumentFromFile(file);
      const { addressFound, profileFound } = applyCustomerDocumentExtract(
        result,
        draftValues(),
        draftSetters(),
      );
      if (!addressFound && !profileFound) {
        setDocParseStatus('not_found');
        setDocParseNote(formatDocumentExtractNote(result, {
          addressEdited: addressEditedRef.current,
          addressFound,
          profileFound,
        }));
        return;
      }
      setDocParseStatus('found');
      setDocParseNote(formatDocumentExtractNote(result, {
        addressEdited: addressEditedRef.current,
        addressFound,
        profileFound,
      }));
      const websiteFromDoc = result.website?.trim();
      if (websiteFromDoc && websiteFromDoc.includes('.')) {
        setWebsite((prev) => prev.trim() || websiteFromDoc);
        void runAddressLookup(websiteFromDoc);
      }
    } catch {
      setDocParseStatus('error');
      setDocParseNote('Could not read this document. Try a PDF or image, or enter details manually.');
    }
  };

  const handleSourceFile = (file: File) => {
    setSourceFile(file);
    setRecordKind(guessRecordKindFromFile(file));
    void runDocumentExtract(file);
  };

  const runAddressLookup = async (urlOverride?: string) => {
    const url = (urlOverride ?? website).trim();
    if (!url || !url.includes('.')) return;
    if (lookupStatus === 'loading') return;

    setLookupStatus('loading');
    setLookupNote('Looking up company profile from website…');

    try {
      const res = await fetch('/api/company-address-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: url }),
      });

      if (!res.ok) {
        setLookupStatus('error');
        setLookupNote('Could not look up address. Enter it manually.');
        return;
      }

      const result = (await res.json()) as CompanyAddressLookupResult;
      lastLookupUrlRef.current = url;
      const { addressFound, profileFound } = applyCompanyLookup(result, {
        addressEdited: addressEditedRef.current,
        setStreet,
        setCity,
        setState,
        setZip,
        setCompanyFriendly,
        setCompanyLegal,
        setIndustry,
        setDescription,
        setMccCode,
      });

      if (!addressFound && !profileFound) {
        setLookupStatus('not_found');
        setLookupNote('No company profile found on that website. You can enter details manually.');
        return;
      }

      setLookupStatus('found');
      setLookupNote(
        formatLookupNote(result, {
          addressEdited: addressEditedRef.current,
          addressFound,
          profileFound,
        }),
      );
    } catch {
      setLookupStatus('error');
      setLookupNote('Could not look up address. Enter it manually.');
    }
  };

  const submit = () => {
    if (!companyFriendly.trim()) { alert('Friendly company name is required.'); return; }
    const customerId = newId();
    const primaryContactId = newId();
    const contacts: Contact[] = [];
    const primaryLocId = newId();
    if (contactName.trim() || contactEmail.trim()) {
      contacts.push({
        id: primaryContactId,
        name: contactName.trim(),
        email: contactEmail.trim(),
        phone: contactPhone.trim(),
        role: contactRole.trim(),
        isPrimary: true,
        ownershipPct: ownershipPct.trim() ? Number(ownershipPct) : undefined,
        portalAccess: primaryPortalAccess || undefined,
        portalAccessTier: primaryPortalAccess ? primaryPortalTier : undefined,
        locationIds: primaryPortalAccess
          ? mapDraftLocationIds(primaryPortalLocationIds, primaryLocId)
          : undefined,
      });
    }
    otherContacts.forEach((c) => {
      if (!c.name.trim() && !c.email.trim()) return;
      contacts.push({
        id: c.id,
        name: c.name.trim(),
        email: c.email.trim(),
        phone: c.phone.trim(),
        role: c.role.trim(),
        isPrimary: false,
        ownershipPct: c.ownershipPct.trim() ? Number(c.ownershipPct) : undefined,
        portalAccess: c.portalAccess || undefined,
        portalAccessTier: c.portalAccess ? c.portalAccessTier : undefined,
        locationIds: c.portalAccess
          ? mapDraftLocationIds(c.locationIds, primaryLocId)
          : undefined,
      });
    });

    const locations: Location[] = [];
    if (street.trim() || city.trim()) {
      locations.push({
        id: primaryLocId,
        label: 'Primary',
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        isPrimary: true,
      });
    }
    otherLocations.forEach((loc) => {
      if (!loc.street.trim() && !loc.city.trim()) return;
      locations.push({
        id: loc.id,
        label: loc.label.trim() || 'Location',
        street: loc.street.trim(),
        city: loc.city.trim(),
        state: loc.state.trim(),
        zip: loc.zip.trim(),
        isPrimary: false,
      });
    });

    onSave({
      id: customerId,
      company: companyFriendly.trim(),
      companyLegal: companyLegal.trim() || undefined,
      website: website.trim() || undefined,
      industry: industry.trim() || undefined,
      description: description.trim() || undefined,
      taxId: ein.trim() || undefined,
      mccCode: mccCode.trim() || undefined,
      corpType: corpType.trim() || undefined,
      status: 'prospect',
      agent: 'Unassigned',
      spend: 0,
      savings: 0,
      contracts: 0,
      files: sourceFile ? 1 : 0,
      since: 'Just now',
      contacts,
      locations,
    }, sourceFile ? {
      id: newId(),
      customerId,
      locationId: locations.find((l) => l.isPrimary)?.id ?? locations[0]?.id ?? '',
      filename: sourceFile.name,
      recordKind,
      uploadedBy: 'Candid Team',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      size: `${Math.max(1, Math.round(sourceFile.size / 1024))} KB`,
    } : undefined);

    const savedCustomer = {
      id: customerId,
      company: companyFriendly.trim(),
      contacts,
      locations,
    };
    for (const contact of contacts) {
      const grant = grantFromContact(contact, savedCustomer);
      if (grant) upsertPortalGrant(grant);
    }
  };

  return (
    <ModalOverlay onClose={onClose} wide>
      <ModalHeader icon={<PlusIcon />} title="Add Customer" subtitle="Upload a document to prefill, look up a website, or enter details manually" onClose={onClose} />
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <FormSectionTitle first>Import from document</FormSectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
          <div>
            <FieldLabel>Record type</FieldLabel>
            <select value={recordKind} onChange={(e) => setRecordKind(e.target.value as RecordKind)} style={inputStyle}>
              {['Billing', 'Sales', 'Contracts', 'Other'].map((group) => (
                <optgroup key={group} label={group}>
                  {RECORD_KIND_OPTIONS.filter((o) => o.group === group).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            {sourceFile ? (
              <button
                type="button"
                onClick={() => void runDocumentExtract(sourceFile)}
                disabled={docParseStatus === 'loading'}
                style={{
                  width: '100%',
                  border: `1px solid ${BRAND.grayBorder}`,
                  borderRadius: 6,
                  padding: '10px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: docParseStatus === 'loading' ? 'wait' : 'pointer',
                  background: BRAND.grayLight,
                  color: BRAND.grayDark,
                }}
              >
                {docParseStatus === 'loading' ? 'Reading document…' : 'Re-extract from document'}
              </button>
            ) : null}
          </div>
        </div>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${BRAND.grayBorder}`,
            borderRadius: 10,
            padding: 20,
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: docParseNote ? 10 : 18,
            background: BRAND.grayLight,
          }}
        >
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleSourceFile(f);
            }}
          />
          <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark }}>
            {sourceFile ? sourceFile.name : 'Drop a customer record or click to browse'}
          </div>
          <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 4 }}>
            PDF or images — AI will extract company, address, contact, and tax info. The file is saved to the customer record when you add them.
          </div>
        </div>
        {docParseNote ? (
          <p
            style={{
              marginTop: 0,
              marginBottom: 18,
              fontSize: 12,
              lineHeight: 1.5,
              color: docParseStatus === 'found' ? BRAND.green : docParseStatus === 'error' ? BRAND.red : BRAND.gray,
            }}
          >
            {docParseNote}
          </p>
        ) : null}

        <FormSectionTitle>Company</FormSectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <FieldLabel>Company Name (Friendly) *</FieldLabel>
            <input value={companyFriendly} onChange={(e) => setCompanyFriendly(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Company Name (Legal)</FieldLabel>
            <input value={companyLegal} onChange={(e) => setCompanyLegal(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Website URL</FieldLabel>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                value={website}
                onChange={(e) => {
                  setWebsite(e.target.value);
                  if (e.target.value.trim() !== lastLookupUrlRef.current) {
                    setLookupStatus('idle');
                    setLookupNote('');
                  }
                }}
                onBlur={() => {
                  if (website.trim() && website.trim() !== lastLookupUrlRef.current) {
                    void runAddressLookup();
                  }
                }}
                placeholder="https://example.com"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => void runAddressLookup()}
                disabled={!website.trim() || lookupStatus === 'loading'}
                style={{
                  flexShrink: 0,
                  border: `1px solid ${BRAND.grayBorder}`,
                  borderRadius: 6,
                  padding: '0 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: lookupStatus === 'loading' ? 'wait' : 'pointer',
                  background: BRAND.grayLight,
                  color: BRAND.grayDark,
                  whiteSpace: 'nowrap',
                }}
              >
                {lookupStatus === 'loading' ? 'Looking…' : 'Look up company'}
              </button>
            </div>
            {lookupNote ? (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: lookupStatus === 'found' ? BRAND.green : lookupStatus === 'error' ? BRAND.red : BRAND.gray,
                }}
              >
                {lookupNote}
              </p>
            ) : null}
          </div>
        </div>

        <FormSectionTitle>Primary Company Details</FormSectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          <div>
            <FieldLabel>Address</FieldLabel>
            <input
              value={street}
              onChange={(e) => {
                markAddressEdited();
                setStreet(e.target.value);
              }}
              placeholder="Street address"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <FieldLabel>City</FieldLabel>
              <input
                value={city}
                onChange={(e) => {
                  markAddressEdited();
                  setCity(e.target.value);
                }}
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>State</FieldLabel>
              <input
                value={state}
                onChange={(e) => {
                  markAddressEdited();
                  setState(e.target.value);
                }}
                maxLength={2}
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>ZIP</FieldLabel>
              <input
                value={zip}
                onChange={(e) => {
                  markAddressEdited();
                  setZip(e.target.value);
                }}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FieldLabel>Industry</FieldLabel>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Manufacturing & Logistics" style={inputStyle} />
            </div>
            <div>
              <FieldLabel>Corp Type</FieldLabel>
              <select value={corpType} onChange={(e) => setCorpType(e.target.value)} style={inputStyle}>
                <option value="">Select…</option>
                <option value="LLC">LLC</option>
                <option value="S-Corp">S-Corp</option>
                <option value="C-Corp">C-Corp</option>
                <option value="Sole Proprietorship">Sole Proprietorship</option>
                <option value="Partnership">Partnership</option>
                <option value="Non-Profit">Non-Profit</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief summary of what this company does"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FieldLabel>EIN</FieldLabel>
              <input value={ein} onChange={(e) => setEin(e.target.value)} placeholder="00-0000000" style={inputStyle} />
            </div>
            <div>
              <FieldLabel>MCC Code</FieldLabel>
              <input value={mccCode} onChange={(e) => setMccCode(e.target.value)} placeholder="e.g. 5812" style={inputStyle} />
              {mccCode.trim() ? (
                <p style={{ marginTop: 6, fontSize: 11, color: BRAND.gray, lineHeight: 1.4 }}>
                  {(() => {
                    const info = classifyMCC(mccCode);
                    const riskColor = info.risk === 'low' ? BRAND.green : info.risk === 'high' ? BRAND.red : BRAND.amber;
                    return (
                      <>
                        <span style={{ fontWeight: 700, color: riskColor, textTransform: 'uppercase' }}>{info.risk} risk</span>
                        {' · '}
                        {info.label}
                      </>
                    );
                  })()}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <FormSectionTitle>Primary Contact</FormSectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <FieldLabel>Name</FieldLabel>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Role</FieldLabel>
            <input value={contactRole} onChange={(e) => setContactRole(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Phone</FieldLabel>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Ownership %</FieldLabel>
            <input value={ownershipPct} onChange={(e) => setOwnershipPct(e.target.value)} placeholder="e.g. 100" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <PortalAccessFields
              enabled={primaryPortalAccess}
              onEnabledChange={setPrimaryPortalAccess}
              tier={primaryPortalTier}
              onTierChange={setPrimaryPortalTier}
              locations={draftLocations}
              locationIds={primaryPortalLocationIds}
              onLocationIdsChange={setPrimaryPortalLocationIds}
              inviteDisabled
              inviteDisabledReason="Save the customer, then send the invite from the contact record."
            />
          </div>
        </div>

        <FormSectionTitle>Other Contacts</FormSectionTitle>
        {otherContacts.map((c, i) => (
          <div key={c.id} style={{ border: `1px solid ${BRAND.grayBorder}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <FieldLabel>Contact {i + 1}</FieldLabel>
              <button type="button" onClick={() => setOtherContacts((prev) => prev.filter((x) => x.id !== c.id))} style={{ border: 'none', background: 'transparent', color: BRAND.red, cursor: 'pointer', fontSize: 12 }}>Remove</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input value={c.name} onChange={(e) => setOtherContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))} placeholder="Name" style={inputStyle} />
              <input value={c.role} onChange={(e) => setOtherContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, role: e.target.value } : x))} placeholder="Role" style={inputStyle} />
              <input value={c.email} onChange={(e) => setOtherContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, email: e.target.value } : x))} placeholder="Email" type="email" style={inputStyle} />
              <input value={c.phone} onChange={(e) => setOtherContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, phone: e.target.value } : x))} placeholder="Phone" style={inputStyle} />
              <input value={c.ownershipPct} onChange={(e) => setOtherContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, ownershipPct: e.target.value } : x))} placeholder="Ownership %" style={inputStyle} />
            </div>
            <PortalAccessFields
              enabled={c.portalAccess}
              onEnabledChange={(value) => setOtherContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, portalAccess: value } : x))}
              tier={c.portalAccessTier}
              onTierChange={(tier) => setOtherContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, portalAccessTier: tier } : x))}
              locations={draftLocations}
              locationIds={c.locationIds}
              onLocationIdsChange={(ids) => setOtherContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, locationIds: ids } : x))}
              inviteDisabled
              inviteDisabledReason="Save the customer, then send the invite from the contact record."
            />
          </div>
        ))}
        <button type="button" onClick={() => setOtherContacts((prev) => [...prev, emptyDraftContact()])} style={{ background: BRAND.grayLight, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: BRAND.grayDark }}>+ Add contact</button>

        <FormSectionTitle>Additional Locations</FormSectionTitle>
        {otherLocations.map((loc, i) => (
          <div key={loc.id} style={{ border: `1px solid ${BRAND.grayBorder}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <FieldLabel>Location {i + 1}</FieldLabel>
              <button type="button" onClick={() => setOtherLocations((prev) => prev.filter((x) => x.id !== loc.id))} style={{ border: 'none', background: 'transparent', color: BRAND.red, cursor: 'pointer', fontSize: 12 }}>Remove</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input value={loc.label} onChange={(e) => setOtherLocations((prev) => prev.map((x) => x.id === loc.id ? { ...x, label: e.target.value } : x))} placeholder="Label" style={inputStyle} />
              <input value={loc.street} onChange={(e) => setOtherLocations((prev) => prev.map((x) => x.id === loc.id ? { ...x, street: e.target.value } : x))} placeholder="Street" style={inputStyle} />
              <input value={loc.city} onChange={(e) => setOtherLocations((prev) => prev.map((x) => x.id === loc.id ? { ...x, city: e.target.value } : x))} placeholder="City" style={inputStyle} />
              <input value={loc.state} onChange={(e) => setOtherLocations((prev) => prev.map((x) => x.id === loc.id ? { ...x, state: e.target.value } : x))} placeholder="State" style={inputStyle} maxLength={2} />
              <input value={loc.zip} onChange={(e) => setOtherLocations((prev) => prev.map((x) => x.id === loc.id ? { ...x, zip: e.target.value } : x))} placeholder="ZIP" style={inputStyle} />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setOtherLocations((prev) => [...prev, emptyDraftLocation()])} style={{ background: BRAND.grayLight, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: BRAND.grayDark }}>+ Add location</button>

        <FormFooter onCancel={onClose} onSave={submit} saveLabel="Add Customer" />
      </div>
    </ModalOverlay>
  );
};

// ─────────────────────────────────────────────────────────────
// EDIT CUSTOMER MODAL
// ─────────────────────────────────────────────────────────────
const EditCustomerModal: React.FC<{
  customer: Customer;
  onClose: () => void;
  onSave: (patch: Partial<Customer>) => void;
}> = ({ customer, onClose, onSave }) => {
  const [company,  setCompany]  = useState(customer.company);
  const [industry, setIndustry] = useState(customer.industry ?? '');
  const [description, setDescription] = useState(customer.description ?? '');
  const [website,  setWebsite]  = useState(customer.website ?? '');
  const [taxId,    setTaxId]    = useState(customer.taxId ?? '');
  const [agent,    setAgent]    = useState(customer.agent);
  const [status,   setStatus]   = useState<CustomerStatus>(customer.status);
  const [notes,    setNotes]    = useState(customer.notes ?? '');

  const submit = () => {
    if (!company.trim()) { alert('Company name is required.'); return; }
    onSave({
      company: company.trim(),
      industry: industry.trim() || undefined,
      description: description.trim() || undefined,
      website: website.trim() || undefined,
      taxId: taxId.trim() || undefined,
      agent: agent.trim() || customer.agent,
      status,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader
        icon={<EditIcon />}
        title="Edit Customer"
        subtitle="Business information and account ownership"
        onClose={onClose}
      />
      <div style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Company Name *</FieldLabel>
            <input value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Industry</FieldLabel>
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Manufacturing" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Website</FieldLabel>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief summary of what this company does"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div>
            <FieldLabel>Tax ID / EIN</FieldLabel>
            <input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="00-0000000" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Sales Agent</FieldLabel>
            <input value={agent} onChange={(e) => setAgent(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Status</FieldLabel>
            <select value={status} onChange={(e) => setStatus(e.target.value as CustomerStatus)} style={inputStyle}>
              <option value="active">Active</option>
              <option value="prospect">Prospect</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Internal Notes</FieldLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Renewal cadence, internal ownership, deal context — visible to the Candid team only."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: "'DM Sans',sans-serif" }}
            />
          </div>
        </div>
        <FormFooter onCancel={onClose} onSave={submit} />
      </div>
    </ModalOverlay>
  );
};

// ─────────────────────────────────────────────────────────────
// CONTACT MODAL (add or edit)
// ─────────────────────────────────────────────────────────────
const ContactModal: React.FC<{
  existing: Contact | null;
  customer: Customer;
  onClose: () => void;
  onSave: (contact: Contact) => void;
}> = ({ existing, customer, onClose, onSave }) => {
  const [name,      setName]      = useState(existing?.name      ?? '');
  const [role,      setRole]      = useState(existing?.role      ?? '');
  const [email,     setEmail]     = useState(existing?.email     ?? '');
  const [phone,     setPhone]     = useState(existing?.phone     ?? '');
  const [isPrimary, setIsPrimary] = useState(existing?.isPrimary ?? false);
  const [portalAccess, setPortalAccess] = useState(existing?.portalAccess ?? false);
  const [portalTier, setPortalTier] = useState<PortalAccessTier>(existing?.portalAccessTier ?? 'trial');
  const [locationIds, setLocationIds] = useState<string[]>(existing?.locationIds ?? []);
  const [inviteSentAt, setInviteSentAt] = useState(existing?.portalInviteSentAt);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [inviteSending, setInviteSending] = useState(false);

  const submit = () => {
    if (!name.trim()) { alert('Contact name is required.'); return; }
    if (!email.trim()) { alert('Email is required.'); return; }
    onSave({
      id: existing?.id ?? newId(),
      name: name.trim(),
      role: role.trim(),
      email: email.trim(),
      phone: phone.trim(),
      isPrimary,
      portalAccess: portalAccess || undefined,
      portalAccessTier: portalAccess ? portalTier : undefined,
      locationIds: portalAccess ? locationIds : undefined,
      portalInviteSentAt: inviteSentAt,
    });
  };

  const handleSendInvite = async () => {
    if (!email.trim()) {
      setInviteNotice('Add an email address before sending an invite.');
      return;
    }
    if (!portalAccess) {
      setInviteNotice('Enable portal access first.');
      return;
    }
    const contact: Contact = {
      id: existing?.id ?? newId(),
      name: name.trim(),
      role: role.trim(),
      email: email.trim(),
      phone: phone.trim(),
      isPrimary,
      portalAccess: true,
      portalAccessTier: portalTier,
      locationIds,
    };
    const grant = grantFromContact(contact, customer);
    if (!grant) return;

    setInviteSending(true);
    const result = await sendPortalInvite(grant);
    setInviteSending(false);

    if (result.ok) {
      const sentAt = new Date().toISOString();
      setInviteSentAt(sentAt);
      setInviteNotice(result.message);
      onSave({ ...contact, portalInviteSentAt: sentAt });
    } else {
      setInviteNotice(result.message);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader
        icon={<UserIcon />}
        title={existing ? 'Edit Contact' : 'Add Contact'}
        subtitle={existing ? 'Update name, role, and contact details' : 'New person attached to this customer'}
        onClose={onClose}
      />
      <div style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <FieldLabel>Full Name *</FieldLabel>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Role / Title</FieldLabel>
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. CFO, IT Director" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Email *</FieldLabel>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Phone</FieldLabel>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: BRAND.grayDark, marginTop: 4 }}>
              <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
              Set as primary contact
            </label>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <PortalAccessFields
              enabled={portalAccess}
              onEnabledChange={setPortalAccess}
              tier={portalTier}
              onTierChange={setPortalTier}
              locations={customer.locations}
              locationIds={locationIds}
              onLocationIdsChange={setLocationIds}
              showInvite
              inviteSending={inviteSending}
              onSendInvite={handleSendInvite}
              inviteNotice={inviteNotice}
              inviteSentAt={inviteSentAt}
            />
          </div>
        </div>
        <FormFooter onCancel={onClose} onSave={submit} saveLabel={existing ? 'Save Contact' : 'Add Contact'} />
      </div>
    </ModalOverlay>
  );
};

// ─────────────────────────────────────────────────────────────
// LOCATION MODAL (add or edit)
// ─────────────────────────────────────────────────────────────
const LocationModal: React.FC<{
  existing: Location | null;
  onClose: () => void;
  onSave: (location: Location) => void;
}> = ({ existing, onClose, onSave }) => {
  const [label,     setLabel]     = useState(existing?.label     ?? '');
  const [street,    setStreet]    = useState(existing?.street    ?? '');
  const [city,      setCity]      = useState(existing?.city      ?? '');
  const [state,     setState]     = useState(existing?.state     ?? '');
  const [zip,       setZip]       = useState(existing?.zip       ?? '');
  const [isPrimary, setIsPrimary] = useState(existing?.isPrimary ?? false);

  const submit = () => {
    if (!street.trim() || !city.trim()) {
      alert('Street and city are required.');
      return;
    }
    onSave({
      id: existing?.id ?? newId(),
      label: label.trim() || 'Location',
      street: street.trim(),
      city: city.trim(),
      state: state.trim(),
      zip: zip.trim(),
      isPrimary,
    });
  };

  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader
        icon={<MapPinIcon />}
        title={existing ? 'Edit Location' : 'Add Location'}
        subtitle={existing ? 'Update site name and address' : 'Add a new site or office for this customer'}
        onClose={onClose}
      />
      <div style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Label</FieldLabel>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Headquarters, Warehouse #2" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Street Address *</FieldLabel>
            <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St, Suite 200" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>City *</FieldLabel>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Chicago" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>State</FieldLabel>
            <input value={state} onChange={(e) => setState(e.target.value)} placeholder="IL" style={inputStyle} maxLength={2} />
          </div>
          <div>
            <FieldLabel>ZIP</FieldLabel>
            <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="60618" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: BRAND.grayDark, marginTop: 4 }}>
              <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
              Set as primary location
            </label>
          </div>
        </div>
        <FormFooter onCancel={onClose} onSave={submit} saveLabel={existing ? 'Save Location' : 'Add Location'} />
      </div>
    </ModalOverlay>
  );
};

// ─────────────────────────────────────────────────────────────
// CUSTOMER RECORD (detail + edit modals)
// ─────────────────────────────────────────────────────────────
const CustomerRecordWithModals: React.FC<{
  customer: Customer;
  documents: CustomerDocument[];
  contracts: CandidContractRecord[];
  onBack: () => void;
  onUpdateCustomer: (patch: Partial<Customer>) => void;
  onUpsertContact: (contact: Contact) => void;
  onRemoveContact: (id: string) => void;
  onUpsertLocation: (location: Location) => void;
  onRemoveLocation: (id: string) => void;
  onDocumentsChange: (docs: CustomerDocument[]) => void;
  onContractsChange: (contracts: CandidContractRecord[]) => void;
  onViewAsContact?: (contact: Contact) => void;
}> = (props) => {
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [addingLocation, setAddingLocation] = useState(false);
  const [editingContract, setEditingContract] = useState<CandidContractRecord | null>(null);
  const [editingDocument, setEditingDocument] = useState<CustomerDocument | null>(null);
  const [resolvingAction, setResolvingAction] = useState<CustomerAction | null>(null);
  const [resolvePrefill, setResolvePrefill] = useState<{ outcome?: ResolveActionSubmit['outcome']; notes?: string }>();
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [customPrefill, setCustomPrefill] = useState<Partial<CustomActionDraft>>();
  const [actionStoreTick, setActionStoreTick] = useState(0);

  useEffect(() => {
    const refresh = () => setActionStoreTick((n) => n + 1);
    window.addEventListener('candid-customer-actions-updated', refresh);
    return () => window.removeEventListener('candid-customer-actions-updated', refresh);
  }, []);

  const openActions = useMemo(
    () => mergeCustomerActions(props.customer.id, props.customer.portal?.actions ?? []),
    [props.customer.id, props.customer.portal?.actions, actionStoreTick],
  );
  const resolvedActions = useMemo(
    () => getResolvedActionsForCustomer(props.customer.id),
    [props.customer.id, actionStoreTick],
  );

  const primaryLocId =
    props.customer.locations.find((l) => l.isPrimary)?.id ?? props.customer.locations[0]?.id ?? '';

  const handleResolveSubmit = async (payload: ResolveActionSubmit) => {
    if (!resolvingAction) return;
    const { outcome, notes, file, extract } = payload;
    const artifacts = applyActionResolutionToContracts({
      customerId: props.customer.id,
      locationId: primaryLocId,
      action: resolvingAction,
      outcome,
      contracts: props.contracts,
      extract: extract ?? undefined,
      uploadedBy: 'Candid Team',
      file,
    });

    if (artifacts.document) {
      props.onDocumentsChange([artifacts.document, ...props.documents]);
      props.onUpdateCustomer({ files: (props.customer.files ?? 0) + 1 });
    }
    if (artifacts.contracts !== props.contracts) {
      props.onContractsChange(artifacts.contracts);
      props.onUpdateCustomer({
        contracts: artifacts.contracts.length,
      });
      window.dispatchEvent(new Event('candid-contract-updated'));
    }

    resolveCustomerAction({
      customerId: props.customer.id,
      action: resolvingAction,
      outcome,
      notes,
      resolvedBy: 'Candid Team',
      documentId: artifacts.document?.id,
      documentFilename: artifacts.document?.filename,
      contractId: artifacts.document?.contractId,
    });

    setResolvingAction(null);
    setResolvePrefill(undefined);
  };

  const handleAddCustom = (draft: CustomActionDraft) => {
    addCustomCustomerAction(
      props.customer.id,
      {
        kind: draft.kind,
        severity: draft.severity,
        title: draft.title,
        detail: draft.detail,
        suggestedAction: draft.suggestedAction,
        dueDate: draft.dueDate || undefined,
        provider: draft.provider || undefined,
      },
      'Candid Team',
    );
    setAddCustomOpen(false);
    setCustomPrefill(undefined);
  };

  const openResolve = (action: CustomerAction, prefill?: { outcome?: ResolveActionSubmit['outcome']; notes?: string }) => {
    setResolvingAction(action);
    setResolvePrefill(prefill);
  };

  return (
    <>
      <CustomerRecordDetail
        customer={props.customer}
        documents={props.documents}
        contracts={props.contracts}
        uploadedBy="Candid Team"
        openActions={openActions}
        resolvedActions={resolvedActions}
        onBack={props.onBack}
        onUpdateCustomer={props.onUpdateCustomer}
        onUpsertContact={props.onUpsertContact}
        onRemoveContact={props.onRemoveContact}
        onUpsertLocation={props.onUpsertLocation}
        onRemoveLocation={props.onRemoveLocation}
        onDocumentsChange={props.onDocumentsChange}
        onContractsChange={props.onContractsChange}
        onEditCustomer={() => setEditCustomerOpen(true)}
        onAddContact={() => setAddingContact(true)}
        onEditContact={(c) => setEditingContact(c)}
        onAddLocation={() => setAddingLocation(true)}
        onEditLocation={(l) => setEditingLocation(l)}
        onEditContract={(c) => setEditingContract(c)}
        onEditDocument={(d) => setEditingDocument(d)}
        onViewAsContact={props.onViewAsContact}
        onResolveAction={(action) => openResolve(action)}
        onAddCustomAction={() => {
          setCustomPrefill(undefined);
          setAddCustomOpen(true);
        }}
      />
      <CustomerHankChat
        customer={props.customer}
        openActions={openActions}
        contracts={props.contracts}
        onApplyResolve={(action, payload: HankActionResolvePayload) =>
          openResolve(action, { outcome: payload.outcome, notes: payload.notes })
        }
        onApplyAdd={() => {}}
        onOpenResolveModal={openResolve}
        onOpenAddModal={(prefill) => {
          setCustomPrefill(prefill);
          setAddCustomOpen(true);
        }}
      />
      {editCustomerOpen && (
        <EditCustomerModal
          customer={props.customer}
          onClose={() => setEditCustomerOpen(false)}
          onSave={(patch) => {
            props.onUpdateCustomer(patch);
            setEditCustomerOpen(false);
          }}
        />
      )}
      {(addingContact || editingContact) && (
        <ContactModal
          existing={editingContact}
          customer={props.customer}
          onClose={() => { setAddingContact(false); setEditingContact(null); }}
          onSave={(contact) => {
            props.onUpsertContact(contact);
            const grant = grantFromContact(contact, props.customer);
            if (grant) upsertPortalGrant(grant);
            else if (contact.email) removePortalGrant(contact.email);
            setAddingContact(false);
            setEditingContact(null);
          }}
        />
      )}
      {(addingLocation || editingLocation) && (
        <LocationModal
          existing={editingLocation}
          onClose={() => { setAddingLocation(false); setEditingLocation(null); }}
          onSave={(location) => {
            props.onUpsertLocation(location);
            setAddingLocation(false);
            setEditingLocation(null);
          }}
        />
      )}
      {editingContract && (
        <EditContractModal
          contract={editingContract}
          locations={props.customer.locations}
          onClose={() => setEditingContract(null)}
          onSave={(updated) => {
            props.onContractsChange(
              props.contracts.map((c) => (c.id === updated.id ? updated : c)),
            );
            setEditingContract(null);
          }}
          onDelete={() => {
            const removed = editingContract;
            hideContract(removed);
            props.onContractsChange(props.contracts.filter((c) => c.id !== removed.id));
            props.onUpdateCustomer({
              contracts: Math.max(0, (props.customer.contracts ?? 0) - 1),
            });
            setEditingContract(null);
          }}
        />
      )}
      {editingDocument && (
        <EditDocumentModal
          document={editingDocument}
          locations={props.customer.locations}
          onClose={() => setEditingDocument(null)}
          onSave={(updated) => {
            props.onDocumentsChange(
              props.documents.map((d) => (d.id === updated.id ? updated : d)),
            );
            setEditingDocument(null);
          }}
          onDelete={() => {
            props.onDocumentsChange(props.documents.filter((d) => d.id !== editingDocument.id));
            props.onUpdateCustomer({ files: Math.max(0, (props.customer.files ?? 0) - 1) });
            setEditingDocument(null);
          }}
        />
      )}
      {resolvingAction && (
        <ResolveCustomerActionModal
          action={resolvingAction}
          initialOutcome={resolvePrefill?.outcome}
          initialNotes={resolvePrefill?.notes}
          onClose={() => {
            setResolvingAction(null);
            setResolvePrefill(undefined);
          }}
          onSubmit={handleResolveSubmit}
        />
      )}
      {addCustomOpen && (
        <AddCustomActionModal
          initial={customPrefill}
          onClose={() => {
            setAddCustomOpen(false);
            setCustomPrefill(undefined);
          }}
          onSubmit={handleAddCustom}
        />
      )}
    </>
  );
};

export default CustomersView;
