'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminQuoteWorkflowEmbed } from '@/components/admin/AdminQuoteWorkflowEmbed';
import { startAdminInitiatedQuoteRequest } from '@/lib/services/admin-initiated-quote-client';
import {
  fetchAndLaunchQuoteReadyEmail,
  resolveQuoteCustomerEmail,
} from '@/lib/quotes/quote-customer-email';
import { DealPipelineTimeline } from '@/components/admin/DealPipelineTimeline';
import {
  CONTRACT_DEAL_STAGE_LABEL,
  CONTRACT_DEAL_STAGE_SHORT,
  normalizeContractDealStage,
  ticketStatusForDealStage,
  type ContractSubmitActionRow,
} from '@/lib/services/contract-submit-actions';

const BRAND = {
  red: 'var(--red)',
  redDark: 'var(--red-dark)',
  redLight: 'var(--red-light)',
  grayDark: 'var(--gray-dark)',
  gray: 'var(--gray)',
  grayLight: 'var(--gray-light)',
  grayBorder: 'var(--gray-border)',
  white: 'var(--white)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  blue: 'var(--blue)',
  onAccent: '#FFFFFF',
  headerBg: 'var(--panel-dark)',
} as const;

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'inactive';

/** Action-center-aligned work buckets used for tabs + primary status. */
export type LeadWorkTab = 'all' | 'open' | 'in_progress' | 'converted' | 'closed';

export type LeadSource = 'bill_analysis' | 'quote_request' | 'manual';
export type LeadLifecycle = 'open' | 'converted' | 'closed';
export type LeadCloseReason = 'lost' | 'duplicate' | 'spam' | 'other';

export type LeadContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isDecisionMaker: boolean;
  isPrimary: boolean;
};

export type LeadLocation = {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  isPrimary: boolean;
};

export type LeadDocument = {
  id: string;
  filename: string;
  /** Same kinds as account records, plus email snapshots. */
  recordKind: string;
  uploadedBy: string;
  date: string;
  size: string;
  storagePath?: string;
  description?: string;
  contractId?: string;
  /** Set after “Run analysis” queues a bill_analysis_reviews row. */
  analysisReviewId?: string;
};

export type Lead = {
  id: string;
  companyFriendly: string;
  companyLegal?: string;
  website?: string;
  itSupport?: string;
  helpWith?: string;
  currentTechnology?: string;
  status: LeadStatus;
  createdAt: string;
  contacts: LeadContact[];
  locations: LeadLocation[];
  documents?: LeadDocument[];
  /** Optional deal snapshots when a Candid contract is imported onto the lead. */
  contracts?: Array<Record<string, unknown>>;
  source?: LeadSource;
  quoteRequestId?: string;
  analysisReviewId?: string;
  portalLeadRowId?: string;
  lifecycle?: LeadLifecycle;
  dealStage?: string | null;
  closeReason?: LeadCloseReason;
  closeNote?: string;
  convertedCustomerId?: string;
};

const newId = () => `id-${Math.random().toString(36).slice(2, 10)}`;

function leadLifecycle(lead: Lead): LeadLifecycle {
  if (lead.lifecycle) return lead.lifecycle;
  return lead.status === 'inactive' ? 'closed' : 'open';
}

function leadSourceLabel(source?: LeadSource): string {
  switch (source) {
    case 'quote_request':
      return 'Quote request';
    case 'bill_analysis':
      return 'Bill analysis';
    case 'manual':
      return 'Manual';
    default:
      return 'Lead';
  }
}

function computeStatus(lead: {
  status?: LeadStatus;
  contacts?: LeadContact[];
  helpWith?: string;
}): LeadStatus {
  if (lead.status) return lead.status;
  const hasDecisionMaker = lead.contacts?.some((c) => c.isDecisionMaker) ?? false;
  const hasNeeds = !!(lead.helpWith && lead.helpWith.trim());
  if (hasDecisionMaker && hasNeeds) return 'qualified';
  if (lead.contacts?.length) return 'contacted';
  return 'new';
}

function findDealActionForLead(
  lead: Lead,
  actions: ContractSubmitActionRow[],
): ContractSubmitActionRow | null {
  if (!actions.length) return null;
  return (
    actions.find((a) => lead.portalLeadRowId && a.lead_id === lead.portalLeadRowId) ??
    actions.find(
      (a) => lead.analysisReviewId && a.analysis_review_id === lead.analysisReviewId,
    ) ??
    actions.find((a) => lead.quoteRequestId && a.quote_request_id === lead.quoteRequestId) ??
    null
  );
}

type LeadDisplayStatus = {
  /** Tab / Action Center work bucket. */
  work: Exclude<LeadWorkTab, 'all'>;
  /** Primary pill label. */
  label: string;
  /** Secondary line (deal stage, close reason, etc.). */
  detail?: string;
  tone: 'open' | 'in_progress' | 'resolved' | 'converted' | 'closed' | 'crm';
};

function resolveLeadDisplayStatus(
  lead: Lead,
  actions: ContractSubmitActionRow[] = [],
): LeadDisplayStatus {
  const lifecycle = leadLifecycle(lead);
  if (lifecycle === 'converted') {
    return { work: 'converted', label: 'Converted', tone: 'converted' };
  }
  if (lifecycle === 'closed') {
    return {
      work: 'closed',
      label: 'Closed',
      detail: lead.closeReason ? `Reason: ${lead.closeReason}` : undefined,
      tone: 'closed',
    };
  }

  const action = findDealActionForLead(lead, actions);
  const rawStage = action?.status || lead.dealStage || null;
  if (rawStage) {
    const stage = normalizeContractDealStage(rawStage);
    if (stage === 'converted') {
      return {
        work: 'converted',
        label: 'Converted',
        detail: CONTRACT_DEAL_STAGE_SHORT[stage],
        tone: 'converted',
      };
    }
    const ac = ticketStatusForDealStage(stage);
    return {
      work: ac === 'in_progress' ? 'in_progress' : 'open',
      label: ac === 'in_progress' ? 'In progress' : 'Open',
      detail: CONTRACT_DEAL_STAGE_SHORT[stage] || CONTRACT_DEAL_STAGE_LABEL[stage],
      tone: ac === 'in_progress' ? 'in_progress' : 'open',
    };
  }

  // Portal bill/quote leads without a deal yet still track as Action Center "open".
  if (lead.source === 'bill_analysis' || lead.source === 'quote_request') {
    return {
      work: 'open',
      label: 'Open',
      detail: 'Awaiting quote accept / pipeline',
      tone: 'open',
    };
  }

  const crm = computeStatus(lead);
  if (crm === 'inactive') {
    return { work: 'closed', label: 'Inactive', tone: 'closed' };
  }
  if (crm === 'new') {
    return { work: 'open', label: 'New', detail: 'Needs outreach', tone: 'crm' };
  }
  if (crm === 'contacted') {
    return { work: 'in_progress', label: 'Contacted', tone: 'crm' };
  }
  return { work: 'in_progress', label: 'Qualified', tone: 'crm' };
}

function primaryContact(lead: Lead): LeadContact | undefined {
  return lead.contacts.find((c) => c.isPrimary) ?? lead.contacts[0];
}
function primaryLocation(lead: Lead): LeadLocation | undefined {
  return lead.locations.find((l) => l.isPrimary) ?? lead.locations[0];
}
function formatLocation(loc?: LeadLocation): string {
  if (!loc) return '—';
  const cityState = [loc.city, loc.state].filter(Boolean).join(', ');
  return [loc.street, cityState, loc.zip].filter(Boolean).join(' · ');
}

export const INITIAL_LEADS: Lead[] = [
  {
    id: 'l-brightwave',
    companyFriendly: 'BrightWave Fitness',
    companyLegal: 'BrightWave Fitness Holdings, LLC',
    website: 'https://brightwavefitness.com',
    itSupport: 'In-house office manager (part-time) + ad-hoc MSP',
    helpWith: 'Internet upgrade for 3 locations + phone system consolidation',
    currentTechnology: 'Comcast Business, RingCentral, Square POS, Google Workspace',
    status: 'qualified',
    createdAt: 'May 2026',
    contacts: [
      { id: 'lc-1', name: 'Amanda Pierce', email: 'amanda@brightwavefitness.com', phone: '(312) 555-0201', role: 'COO', isDecisionMaker: true, isPrimary: true },
      { id: 'lc-2', name: 'Jake Nguyen', email: 'jake@brightwavefitness.com', phone: '(312) 555-0202', role: 'Facilities Manager', isDecisionMaker: false, isPrimary: false },
    ],
    locations: [
      { id: 'll-1', label: 'HQ', street: '150 W Madison St', city: 'Chicago', state: 'IL', zip: '60602', isPrimary: true },
      { id: 'll-2', label: 'Location #2', street: '2940 N Broadway', city: 'Chicago', state: 'IL', zip: '60657', isPrimary: false },
    ],
  },
  {
    id: 'l-lakeshore',
    companyFriendly: 'Lakeshore Pediatrics',
    companyLegal: 'Lakeshore Pediatrics PC',
    website: 'https://lakeshorepeds.example',
    itSupport: 'External MSP (unknown contract terms)',
    helpWith: 'Security + endpoint + HIPAA alignment',
    currentTechnology: 'AT&T Fiber, Microsoft 365, Sophos',
    status: 'contacted',
    createdAt: 'May 2026',
    contacts: [
      { id: 'lc-3', name: 'Dr. Nina Alvarado', email: 'nina@lakeshorepeds.example', phone: '(773) 555-0301', role: 'Owner / Physician', isDecisionMaker: true, isPrimary: true },
    ],
    locations: [
      { id: 'll-3', label: 'Main Clinic', street: '2121 N Clark St', city: 'Chicago', state: 'IL', zip: '60614', isPrimary: true },
    ],
  },
  {
    id: 'l-ironridge',
    companyFriendly: 'IronRidge Builders',
    companyLegal: 'IronRidge Builders, Inc.',
    website: 'https://ironridgebuilders.com',
    itSupport: 'Owner-managed',
    helpWith: 'New office buildout (internet + phones)',
    currentTechnology: 'Verizon Wireless + basic router',
    status: 'new',
    createdAt: 'May 2026',
    contacts: [
      { id: 'lc-4', name: 'Tom Keller', email: 'tom@ironridgebuilders.com', phone: '(847) 555-0401', role: 'Owner', isDecisionMaker: true, isPrimary: true },
    ],
    locations: [
      { id: 'll-4', label: 'New Office', street: '7750 W Touhy Ave', city: 'Niles', state: 'IL', zip: '60714', isPrimary: true },
    ],
  },
];

const StatusPill: React.FC<{ display: LeadDisplayStatus }> = ({ display }) => {
  const map: Record<LeadDisplayStatus['tone'], { bg: string; color: string }> = {
    open: { bg: 'var(--gray-light)', color: BRAND.gray },
    in_progress: { bg: 'var(--blue-light)', color: BRAND.blue },
    resolved: { bg: 'var(--green-light)', color: BRAND.green },
    converted: { bg: 'var(--green-light)', color: BRAND.green },
    closed: { bg: 'rgba(225,29,72,0.12)', color: BRAND.red },
    crm: { bg: 'var(--gray-light)', color: BRAND.grayDark },
  };
  const s = map[display.tone];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span
        style={{
          alignSelf: 'flex-start',
          background: s.bg,
          color: s.color,
          padding: '3px 10px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {display.label}
      </span>
      {display.detail ? (
        <span style={{ fontSize: 11, color: BRAND.gray, lineHeight: 1.3 }}>{display.detail}</span>
      ) : null}
    </div>
  );
};

const iconBase = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const PlusIcon = () => (<svg {...iconBase}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const SearchIcon = () => (<svg {...iconBase}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);
const EyeIcon = () => (<svg {...iconBase}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
const TrashIcon = () => (<svg {...iconBase}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
const EditIcon = () => (<svg {...iconBase}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);
const ChevronLeftIcon = () => (<svg {...iconBase}><polyline points="15 18 9 12 15 6" /></svg>);

const PrimaryBtn: React.FC<{
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}> = ({ onClick, children, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: `linear-gradient(135deg, ${BRAND.redDark}, ${BRAND.redLight})`,
      color: BRAND.onAccent, border: 'none', borderRadius: 6,
      padding: '9px 16px', fontFamily: "'DM Sans', sans-serif",
      fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.7 : 1,
    }}
  >
    {children}
  </button>
);

const ActionBtn: React.FC<{
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, danger, children }) => (
  <button
    onClick={(e) => onClick?.(e)}
    title={title}
    style={{
      width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 5,
      color: danger ? BRAND.red : BRAND.gray, cursor: 'pointer', padding: 0,
    }}
    onMouseOver={(e) => (e.currentTarget.style.background = BRAND.grayLight)}
    onMouseOut={(e) => (e.currentTarget.style.background = BRAND.white)}
  >
    {children}
  </button>
);

const Th: React.FC<{ children: React.ReactNode; center?: boolean }> = ({ children, center }) => (
  <th style={{ padding: '11px 16px', textAlign: center ? 'center' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.gray }}>
    {children}
  </th>
);

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

const ModalOverlay: React.FC<{ onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ onClose, children, wide }) => (
  <div
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 650, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: 16 }}
  >
    <div style={{ background: BRAND.white, borderRadius: 14, width: wide ? 680 : 560, maxWidth: '95vw', maxHeight: '92vh', boxShadow: '0 24px 80px rgba(0,0,0,0.28)', overflow: 'hidden', animation: 'modalIn 0.25s ease forwards', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode; first?: boolean }> = ({ children, first }) => (
  <div style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray,
    margin: first ? '0 0 10px' : '18px 0 10px', paddingTop: first ? 0 : 4,
    borderTop: first ? 'none' : `1px solid ${BRAND.grayBorder}`,
  }}>
    {children}
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

const LeadFormModal: React.FC<{
  lead: Lead | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (next: Lead) => void;
}> = ({ lead, isNew, onClose, onSave }) => {
  const pc = lead ? primaryContact(lead) : undefined;
  const [companyFriendly, setCompanyFriendly] = useState(lead?.companyFriendly ?? '');
  const [companyLegal, setCompanyLegal] = useState(lead?.companyLegal ?? '');
  const [website, setWebsite] = useState(lead?.website ?? '');
  const [itSupport, setItSupport] = useState(lead?.itSupport ?? '');
  const [helpWith, setHelpWith] = useState(lead?.helpWith ?? '');
  const [currentTechnology, setCurrentTechnology] = useState(lead?.currentTechnology ?? '');
  const [status, setStatus] = useState<LeadStatus>(lead?.status ?? 'new');
  const [contactName, setContactName] = useState(pc?.name ?? '');
  const [contactEmail, setContactEmail] = useState(pc?.email ?? '');
  const [contactPhone, setContactPhone] = useState(pc?.phone ?? '');
  const [contactRole, setContactRole] = useState(pc?.role ?? '');
  const [isDecisionMaker, setIsDecisionMaker] = useState(pc?.isDecisionMaker ?? false);

  const submit = () => {
    if (!companyFriendly.trim()) { alert('Friendly company name is required.'); return; }
    const contactId = pc?.id ?? newId();
    const primary: LeadContact = {
      id: contactId,
      name: contactName.trim(),
      email: contactEmail.trim(),
      phone: contactPhone.trim(),
      role: contactRole.trim(),
      isDecisionMaker,
      isPrimary: true,
    };
    const otherContacts = (lead?.contacts ?? []).filter((c) => c.id !== contactId);
    const contacts = contactName.trim() || contactEmail.trim() ? [primary, ...otherContacts] : otherContacts;

    const next: Lead = {
      id: lead?.id ?? newId(),
      companyFriendly: companyFriendly.trim(),
      companyLegal: companyLegal.trim() || undefined,
      website: website.trim() || undefined,
      itSupport: itSupport.trim() || undefined,
      helpWith: helpWith.trim() || undefined,
      currentTechnology: currentTechnology.trim() || undefined,
      status: isNew ? computeStatus({ contacts, helpWith }) : status,
      createdAt: lead?.createdAt ?? 'Just now',
      contacts,
      locations: lead?.locations ?? [],
      source: lead?.source ?? 'manual',
      lifecycle: lead?.lifecycle ?? 'open',
      portalLeadRowId: lead?.portalLeadRowId,
      analysisReviewId: lead?.analysisReviewId,
      quoteRequestId: lead?.quoteRequestId,
      dealStage: lead?.dealStage,
      closeReason: lead?.closeReason,
      closeNote: lead?.closeNote,
      convertedCustomerId: lead?.convertedCustomerId,
    };
    onSave(next);
  };

  return (
    <ModalOverlay onClose={onClose} wide>
      <div style={{ background: BRAND.headerBg, padding: '20px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})` }} />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: BRAND.onAccent }}>{isNew ? 'Add Lead' : 'Edit Lead'}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Company, primary contact, and discovery fields</div>
        </div>
        <button type="button" onClick={onClose} style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>

      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <SectionTitle first>Company</SectionTitle>
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
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" style={inputStyle} />
          </div>
        </div>

        <SectionTitle>Contact</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <FieldLabel>Name</FieldLabel>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Role</FieldLabel>
            <input value={contactRole} onChange={(e) => setContactRole(e.target.value)} placeholder="e.g. Owner, IT Director" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Phone</FieldLabel>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: BRAND.grayDark }}>
              <input type="checkbox" checked={isDecisionMaker} onChange={(e) => setIsDecisionMaker(e.target.checked)} />
              Decision maker?
            </label>
          </div>
        </div>

        <SectionTitle>Discovery</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          <div>
            <FieldLabel>Who currently supports IT needs?</FieldLabel>
            <input value={itSupport} onChange={(e) => setItSupport(e.target.value)} placeholder="In-house, MSP, vendor mix…" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>What can we most help with?</FieldLabel>
            <textarea value={helpWith} onChange={(e) => setHelpWith(e.target.value)} rows={2} placeholder="Phones, internet, security, merchant processing…" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          {!isNew && (
            <>
              <div>
                <FieldLabel>Status</FieldLabel>
                <select value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)} style={inputStyle}>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <FieldLabel>Current Technology / Services</FieldLabel>
                <textarea value={currentTechnology} onChange={(e) => setCurrentTechnology(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button type="button" onClick={onClose} style={{ background: BRAND.grayLight, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 7, padding: '11px 18px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: BRAND.grayDark, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={submit} style={{ background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`, color: BRAND.onAccent, border: 'none', borderRadius: 7, padding: '11px 22px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{isNew ? 'Add Lead' : 'Save Lead'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
};

const CloseLeadModal: React.FC<{
  lead: Lead;
  onClose: () => void;
  onConfirm: (reason: LeadCloseReason, note: string) => void;
}> = ({ lead, onClose, onConfirm }) => {
  const [reason, setReason] = useState<LeadCloseReason>('lost');
  const [note, setNote] = useState('');

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ background: BRAND.headerBg, padding: '20px 26px', position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})` }} />
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: BRAND.onAccent }}>Close lead</div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{lead.companyFriendly}</div>
      </div>
      <div style={{ padding: 24 }}>
        <FieldLabel>Reason</FieldLabel>
        <select value={reason} onChange={(e) => setReason(e.target.value as LeadCloseReason)} style={{ ...inputStyle, marginBottom: 14 }}>
          <option value="lost">Lost</option>
          <option value="duplicate">Duplicate</option>
          <option value="spam">Spam</option>
          <option value="other">Other</option>
        </select>
        <FieldLabel>Note (optional)</FieldLabel>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 18 }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ background: BRAND.grayLight, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 7, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={() => onConfirm(reason, note.trim())} style={{ background: BRAND.red, color: BRAND.onAccent, border: 'none', borderRadius: 7, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close lead</button>
        </div>
      </div>
    </ModalOverlay>
  );
};

export const LeadsView: React.FC<{
  portalLeads?: Lead[];
  onRefreshLeads?: () => void | Promise<void>;
  onOpenQuoteRequest?: (quoteRequestId: string) => void;
  onConvertLead?: (lead: Lead) => void;
  onOpenCustomer?: (customerId: string) => void;
  /** Open Action Center analysis review (e.g. after Run analysis on a lead statement). */
  onOpenAnalysisReview?: (reviewId: string) => void;
  onViewPublishedQuoteAsCustomer?: (
    quoteRequestId: string,
    contact?: { name?: string; email?: string },
  ) => void;
  analysisReviews?: import('@/lib/bill-parse-types').BillAnalysisReviewRow[];
  /** Select a lead by `id` or `portalLeadRowId` when navigating from elsewhere. */
  focusLeadKey?: string | null;
  onFocusLeadConsumed?: () => void;
  contractSubmitActions?: import('@/lib/services/contract-submit-actions').ContractSubmitActionRow[];
  onContractPipelineUpdated?: () => void;
  currentUserId?: string;
}> = ({
  portalLeads = [],
  onRefreshLeads,
  onOpenQuoteRequest,
  onConvertLead,
  onOpenCustomer,
  onOpenAnalysisReview,
  onViewPublishedQuoteAsCustomer,
  analysisReviews = [],
  focusLeadKey = null,
  onFocusLeadConsumed,
  contractSubmitActions = [],
  onContractPipelineUpdated,
  currentUserId,
}) => {
  const mergedSeed = useMemo(() => {
    const dynamicIds = new Set(portalLeads.map((l) => l.id));
    return [...portalLeads, ...INITIAL_LEADS.filter((l) => !dynamicIds.has(l.id))];
  }, [portalLeads]);
  const [leads, setLeads] = useState<Lead[]>(mergedSeed);
  const [activeTab, setActiveTab] = useState<LeadWorkTab>('all');
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Lead[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leadModal, setLeadModal] = useState<{ lead: Lead | null; isNew: boolean } | null>(null);
  const [closeLead, setCloseLead] = useState<Lead | null>(null);
  const [savingLead, setSavingLead] = useState(false);
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);
  const [quoteWorkflowId, setQuoteWorkflowId] = useState<string | null>(null);
  const [quoteStartBusy, setQuoteStartBusy] = useState(false);
  const [quoteStartError, setQuoteStartError] = useState('');
  const [leadQuotePublished, setLeadQuotePublished] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Sync from server/demo seed without wiping unsaved local-only leads mid-save.
  useEffect(() => {
    setLeads((prev) => {
      const seedKeys = new Set<string>();
      for (const l of mergedSeed) {
        seedKeys.add(l.id);
        if (l.portalLeadRowId) seedKeys.add(l.portalLeadRowId);
      }
      const localOnly = prev.filter((l) => {
        if (seedKeys.has(l.id)) return false;
        if (l.portalLeadRowId && seedKeys.has(l.portalLeadRowId)) return false;
        return true;
      });
      return localOnly.length ? [...localOnly, ...mergedSeed] : mergedSeed;
    });
  }, [mergedSeed]);

  useEffect(() => {
    if (!focusLeadKey) return;
    const match = leads.find(
      (l) => l.id === focusLeadKey || l.portalLeadRowId === focusLeadKey,
    );
    if (match) {
      setSelectedId(match.id);
      setActiveTab('all');
    }
    onFocusLeadConsumed?.();
  }, [focusLeadKey, leads, onFocusLeadConsumed]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (!val.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    const q = val.toLowerCase();
    const matches = leads.filter((l) => {
      const pc = primaryContact(l);
      return (
        l.companyFriendly.toLowerCase().includes(q) ||
        (l.companyLegal?.toLowerCase().includes(q) ?? false) ||
        (pc?.name.toLowerCase().includes(q) ?? false) ||
        (pc?.email.toLowerCase().includes(q) ?? false)
      );
    });
    setSuggestions(matches.slice(0, 8));
    setShowSuggestions(true);
  };

  const selected = useMemo(() => (selectedId ? leads.find((l) => l.id === selectedId) ?? null : null), [leads, selectedId]);

  const filtered = leads
    .map((l) => ({ ...l, status: computeStatus(l) }))
    .filter((l) => {
      const display = resolveLeadDisplayStatus(l, contractSubmitActions);
      if (activeTab === 'all') return true;
      return display.work === activeTab;
    })
    .filter((l) => {
      const q = search.toLowerCase();
      if (!q) return true;
      const pc = primaryContact(l);
      return (
        l.companyFriendly.toLowerCase().includes(q) ||
        (l.companyLegal?.toLowerCase().includes(q) ?? false) ||
        (pc?.name.toLowerCase().includes(q) ?? false) ||
        (pc?.email.toLowerCase().includes(q) ?? false)
      );
    });

  const stats = {
    all: leads.length,
    open: leads.filter((l) => resolveLeadDisplayStatus(l, contractSubmitActions).work === 'open')
      .length,
    in_progress: leads.filter(
      (l) => resolveLeadDisplayStatus(l, contractSubmitActions).work === 'in_progress',
    ).length,
    converted: leads.filter(
      (l) => resolveLeadDisplayStatus(l, contractSubmitActions).work === 'converted',
    ).length,
    closed: leads.filter((l) => resolveLeadDisplayStatus(l, contractSubmitActions).work === 'closed')
      .length,
  };

  const persistPortalLead = async (lead: Lead, patch: import('@/lib/services/portal-leads').PortalLeadPatch) => {
    if (!lead.portalLeadRowId) return;
    const { patchPortalLead } = await import('@/lib/services/portal-leads');
    await patchPortalLead(lead.portalLeadRowId, { ...patch, leadData: patch.leadData ?? lead });
    await onRefreshLeads?.();
  };

  const leadDocUrl = (leadId: string, docId: string) =>
    `/api/admin/leads/${encodeURIComponent(leadId)}/documents?docId=${encodeURIComponent(docId)}`;

  const openLeadDocument = (lead: Lead, doc: LeadDocument) => {
    if (!lead.portalLeadRowId || !doc.storagePath) {
      alert('This document is not available to view yet.');
      return;
    }
    void import('@/lib/document-viewer').then(({ openDocumentViewer }) => {
      openDocumentViewer({
        url: leadDocUrl(lead.portalLeadRowId!, doc.id),
        title: doc.filename,
        filename: doc.filename,
      });
    });
  };

  const runLeadDocumentAnalysis = async (lead: Lead, doc: LeadDocument) => {
    if (!lead.portalLeadRowId) {
      alert('Save this lead before running analysis.');
      return;
    }
    if (doc.analysisReviewId || lead.analysisReviewId) {
      const reviewId = doc.analysisReviewId || lead.analysisReviewId!;
      onOpenAnalysisReview?.(reviewId);
      return;
    }
    setAnalyzingDocId(doc.id);
    try {
      const fileRes = await fetch(leadDocUrl(lead.portalLeadRowId, doc.id));
      if (!fileRes.ok) {
        throw new Error('Could not download the statement for analysis');
      }
      const blob = await fileRes.blob();
      const file = new File([blob], doc.filename, {
        type: blob.type || 'application/pdf',
      });
      const { parseBillFromFile } = await import('@/lib/bill-parse');
      const parseResult = await parseBillFromFile(file, lead.companyFriendly);
      const res = await fetch(`/api/admin/leads/${encodeURIComponent(lead.portalLeadRowId)}/run-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, parseResult }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        reviewId?: string;
        lead?: Lead;
      };
      if (!res.ok) throw new Error(data.error || 'Could not queue analysis');
      if (data.lead) {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === lead.id || l.portalLeadRowId === lead.portalLeadRowId ? data.lead! : l,
          ),
        );
      }
      await onRefreshLeads?.();
      if (data.reviewId) onOpenAnalysisReview?.(data.reviewId);
    } catch (err) {
      console.error('runLeadDocumentAnalysis', err);
      alert(err instanceof Error ? err.message : 'Could not run analysis');
    } finally {
      setAnalyzingDocId(null);
    }
  };

  const handleSaveLead = async (next: Lead) => {
    setSavingLead(true);
    setLeadModal(null);
    // Optimistic UI so the row appears immediately.
    setLeads((prev) => {
      const exists = prev.some((l) => l.id === next.id || (next.portalLeadRowId && l.portalLeadRowId === next.portalLeadRowId));
      return exists
        ? prev.map((l) =>
            l.id === next.id || (next.portalLeadRowId && l.portalLeadRowId === next.portalLeadRowId) ? next : l,
          )
        : [next, ...prev];
    });
    try {
      const { saveManualPortalLead, patchPortalLead } = await import('@/lib/services/portal-leads');
      if (next.portalLeadRowId && next.source !== 'manual') {
        // Portal/bill/quote leads: patch existing row.
        await patchPortalLead(next.portalLeadRowId, { leadData: next });
        await onRefreshLeads?.();
        return;
      }
      const result = await saveManualPortalLead(next);
      if (!result.ok || !result.lead) {
        alert(result.error || 'Could not save lead. Please try again.');
        return;
      }
      setLeads((prev) => {
        const saved = result.lead!;
        const withoutTemp = prev.filter(
          (l) => l.id !== next.id && l.portalLeadRowId !== saved.portalLeadRowId,
        );
        return [saved, ...withoutTemp];
      });
      await onRefreshLeads?.();
    } catch (err) {
      console.error('handleSaveLead', err);
      alert(err instanceof Error ? err.message : 'Could not save lead.');
    } finally {
      setSavingLead(false);
    }
  };

  const handleCloseLead = async (lead: Lead, reason: LeadCloseReason, note: string) => {
    const next: Lead = {
      ...lead,
      lifecycle: 'closed',
      closeReason: reason,
      closeNote: note || undefined,
      status: 'inactive',
    };
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? next : l)));
    setCloseLead(null);
    setSelectedId(null);
    if (lead.portalLeadRowId) {
      await persistPortalLead(next, {
        lifecycle: 'closed',
        closeReason: reason,
        closeNote: note || undefined,
        leadData: next,
      });
    }
  };

  const openQuoteWorkflow = (quoteRequestId: string) => {
    setQuoteWorkflowId(quoteRequestId);
  };

  useEffect(() => {
    const id = selected?.quoteRequestId;
    if (!id) {
      setLeadQuotePublished(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/quote-requests/${id}`);
        const data = (await res.json()) as { request?: { published_quote_snapshot?: unknown } };
        if (!cancelled) {
          setLeadQuotePublished(Boolean(data.request?.published_quote_snapshot));
        }
      } catch {
        if (!cancelled) setLeadQuotePublished(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.quoteRequestId, quoteWorkflowId]);

  const startLeadQuote = (lead: Lead) => {
    if (quoteStartBusy) return;
    setQuoteStartError('');
    setQuoteStartBusy(true);
    void startAdminInitiatedQuoteRequest({
      source: 'lead',
      portalLeadRowId: lead.portalLeadRowId,
      leadId: lead.id,
      leadSnapshot: lead,
    })
      .then(({ quoteRequestId }) => {
        setQuoteWorkflowId(quoteRequestId);
        const next: Lead = { ...lead, quoteRequestId };
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? next : l)));
        void onRefreshLeads?.();
      })
      .catch((err) => {
        setQuoteStartError(err instanceof Error ? err.message : 'Could not start quote');
      })
      .finally(() => setQuoteStartBusy(false));
  };

  if (quoteWorkflowId) {
    const workflowLead =
      selected?.quoteRequestId === quoteWorkflowId
        ? selected
        : leads.find((l) => l.quoteRequestId === quoteWorkflowId) ?? selected;
    return (
      <AdminQuoteWorkflowEmbed
        quoteRequestId={quoteWorkflowId}
        onClose={() => setQuoteWorkflowId(null)}
        breadcrumb={
          workflowLead
            ? `Leads / ${workflowLead.companyFriendly} / Quote`
            : 'Leads / Quote'
        }
        currentUserId={currentUserId}
        linkedLead={workflowLead}
        onConvertLead={onConvertLead}
        onOpenLeads={() => setQuoteWorkflowId(null)}
        onRefreshLeads={onRefreshLeads}
        onUpdated={() => void onRefreshLeads?.()}
        onViewPublishedQuoteAsCustomer={onViewPublishedQuoteAsCustomer}
      />
    );
  }

  if (selected) {
    const pc = primaryContact(selected);
    const pl = primaryLocation(selected);
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => setSelectedId(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 6, padding: '8px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: BRAND.grayDark, cursor: 'pointer' }}
          >
            <ChevronLeftIcon /> Back to Leads
          </button>
          <span style={{ fontSize: 13, color: BRAND.gray }}>/ <span style={{ color: BRAND.grayDark, fontWeight: 500 }}>{selected.companyFriendly}</span></span>
        </div>

        <div style={{ background: BRAND.headerBg, borderRadius: 10, padding: '22px 26px', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: BRAND.redLight, marginBottom: 6 }}>Lead</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: BRAND.onAccent, marginBottom: 6 }}>{selected.companyFriendly}</div>
              <div style={{ fontSize: 13, color: '#D1D5DB', marginBottom: 8 }}>
                Contact: {pc?.name || '—'}
                {pc?.email ? ` · ${pc.email}` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.6 }}>
                {selected.companyLegal || 'Legal name not set'}<br />
                {selected.website ? selected.website.replace(/^https?:\/\//, '') : 'Website not set'}<br />
                {formatLocation(pl)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {selected.quoteRequestId ? (
                <>
                  <button
                    type="button"
                    onClick={() => openQuoteWorkflow(selected.quoteRequestId!)}
                    style={{ background: 'rgba(255,255,255,0.12)', color: BRAND.onAccent, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 6, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Continue quote
                  </button>
                  {resolveQuoteCustomerEmail({ contact_email: pc?.email ?? '' }, selected) ? (
                    <button
                      type="button"
                      onClick={() => {
                        void fetchAndLaunchQuoteReadyEmail(selected.quoteRequestId!, selected).then((r) => {
                          if (!r.ok) setQuoteStartError(r.reason ?? 'Could not open email');
                        });
                      }}
                      style={{ background: 'rgba(255,255,255,0.12)', color: BRAND.onAccent, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 6, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Email quote ready
                    </button>
                  ) : null}
                  {leadQuotePublished && onViewPublishedQuoteAsCustomer ? (
                    <button
                      type="button"
                      onClick={() =>
                        onViewPublishedQuoteAsCustomer(selected.quoteRequestId!, {
                          name: pc?.name,
                          email: pc?.email,
                        })
                      }
                      style={{ background: BRAND.red, color: BRAND.onAccent, border: 'none', borderRadius: 6, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      View as customer
                    </button>
                  ) : null}
                </>
              ) : leadLifecycle(selected) === 'open' ? (
                <button
                  type="button"
                  disabled={quoteStartBusy}
                  onClick={() => startLeadQuote(selected)}
                  style={{ background: BRAND.red, color: BRAND.onAccent, border: 'none', borderRadius: 6, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: quoteStartBusy ? 'wait' : 'pointer' }}
                >
                  {quoteStartBusy ? 'Starting…' : '+ Quote'}
                </button>
              ) : null}
              {leadLifecycle(selected) === 'open' && onConvertLead && (
                <button
                  type="button"
                  onClick={() => onConvertLead(selected)}
                  style={{ background: BRAND.green, color: BRAND.onAccent, border: 'none', borderRadius: 6, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Convert to account
                </button>
              )}
              {leadLifecycle(selected) === 'open' && (
                <button
                  type="button"
                  onClick={() => setCloseLead(selected)}
                  style={{ background: 'rgba(255,255,255,0.08)', color: BRAND.onAccent, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Close lead
                </button>
              )}
              {selected.convertedCustomerId && onOpenCustomer && (
                <button
                  type="button"
                  onClick={() => onOpenCustomer(selected.convertedCustomerId!)}
                  style={{ background: 'rgba(255,255,255,0.12)', color: BRAND.onAccent, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 6, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  View account
                </button>
              )}
              <button
                onClick={() => setLeadModal({ lead: selected, isNew: false })}
                style={{ background: 'rgba(255,255,255,0.08)', color: BRAND.onAccent, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                <EditIcon /> Edit
              </button>
            </div>
          </div>
          {quoteStartError ? (
            <div style={{ marginTop: 10, fontSize: 12, color: BRAND.redLight }}>{quoteStartError}</div>
          ) : null}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusPill display={resolveLeadDisplayStatus(selected, contractSubmitActions)} />
            {selected.source ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.04em' }}>
                {leadSourceLabel(selected.source)}
              </span>
            ) : null}
            {leadLifecycle(selected) === 'closed' && selected.closeReason ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>
                Closed — {selected.closeReason}
              </span>
            ) : null}
          </div>
        </div>

        {(selected.portalLeadRowId || selected.dealStage || findDealActionForLead(selected, contractSubmitActions)) && (
          <div style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16, padding: '16px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grayDark, marginBottom: 8 }}>
              Contract deal pipeline
              {(() => {
                const stage =
                  findDealActionForLead(selected, contractSubmitActions)?.status ||
                  selected.dealStage;
                return stage
                  ? ` · ${CONTRACT_DEAL_STAGE_LABEL[normalizeContractDealStage(stage)]}`
                  : '';
              })()}
            </div>
            <DealPipelineTimeline
              leadId={selected.portalLeadRowId}
              dealStage={
                findDealActionForLead(selected, contractSubmitActions)?.status ||
                selected.dealStage
              }
              actions={contractSubmitActions.filter(
                (a) =>
                  a.lead_id === selected.portalLeadRowId ||
                  (selected.analysisReviewId &&
                    a.analysis_review_id === selected.analysisReviewId) ||
                  (selected.quoteRequestId && a.quote_request_id === selected.quoteRequestId),
              )}
              onPipelineUpdated={() => {
                onContractPipelineUpdated?.();
                void onRefreshLeads?.();
              }}
            />
          </div>
        )}

        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BRAND.grayBorder}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grayDark }}>Key Fields</div>
          </div>
          <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 4 }}>Decision Maker</div>
              <div style={{ fontSize: 13, color: BRAND.grayDark }}>{pc ? `${pc.name}${pc.isDecisionMaker ? ' (Yes)' : ' (No)'}` : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 4 }}>Primary Contact</div>
              <div style={{ fontSize: 13, color: BRAND.grayDark }}>{pc ? `${pc.name} · ${pc.email}` : '—'}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 4 }}>Who currently supports IT needs?</div>
              <div style={{ fontSize: 13, color: BRAND.grayDark, lineHeight: 1.55 }}>{selected.itSupport || '—'}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 4 }}>What can we most help with?</div>
              <div style={{ fontSize: 13, color: BRAND.grayDark, lineHeight: 1.55 }}>{selected.helpWith || '—'}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 4 }}>Current Technology / Services</div>
              <div style={{ fontSize: 13, color: BRAND.grayDark, lineHeight: 1.55 }}>{selected.currentTechnology || '—'}</div>
            </div>
          </div>
        </div>

        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BRAND.grayBorder}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grayDark }}>
              Emails &amp; documents
            </div>
            <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
              Imported from MyAssistant All records or uploaded to this lead
            </div>
          </div>
          <div style={{ padding: '14px 20px' }}>
            {(selected.documents ?? []).length === 0 ? (
              <div style={{ fontSize: 13, color: BRAND.gray }}>No emails or documents on this lead yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(selected.documents ?? []).map((doc) => {
                  const canView = Boolean(selected.portalLeadRowId && doc.storagePath);
                  const isStatement =
                    doc.recordKind === 'statement_for_analysis' || doc.recordKind === 'statement';
                  const analysisId = doc.analysisReviewId || selected.analysisReviewId;
                  const analysisReview = analysisId
                    ? analysisReviews.find((r) => r.id === analysisId)
                    : null;
                  const analysisPublished = Boolean(
                    analysisReview?.status === 'published' && analysisReview.published_snapshot,
                  );
                  const analyzing = analyzingDocId === doc.id;
                  return (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 12px',
                        border: `1px solid ${BRAND.grayBorder}`,
                        borderRadius: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openLeadDocument(selected, doc)}
                        disabled={!canView}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: canView ? 'pointer' : 'not-allowed',
                          opacity: canView ? 1 : 0.6,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: canView ? BRAND.red : BRAND.grayDark,
                            textDecoration: canView ? 'underline' : 'none',
                          }}
                        >
                          {doc.filename}
                        </div>
                        <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
                          {doc.recordKind === 'email' ? 'Email' : doc.recordKind.replace(/_/g, ' ')}
                          {' · '}
                          {doc.date}
                          {doc.size ? ` · ${doc.size}` : ''}
                          {analysisId ? ' · Analysis queued' : ''}
                        </div>
                      </button>
                      {isStatement ? (
                        <button
                          type="button"
                          disabled={analyzing}
                          onClick={() => {
                            if (analysisId) onOpenAnalysisReview?.(analysisId);
                            else void runLeadDocumentAnalysis(selected, doc);
                          }}
                          style={{
                            flexShrink: 0,
                            background: analysisId
                              ? BRAND.grayLight
                              : `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`,
                            color: analysisId ? BRAND.grayDark : BRAND.onAccent,
                            border: analysisId ? `1px solid ${BRAND.grayBorder}` : 'none',
                            borderRadius: 7,
                            padding: '8px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: analyzing ? 'wait' : 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {analyzing
                            ? 'Analyzing…'
                            : analysisPublished
                              ? 'View as customer'
                              : analysisId
                                ? 'Open analysis'
                                : 'Run analysis'}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {leadModal && (
          <LeadFormModal
            lead={leadModal.lead}
            isNew={leadModal.isNew}
            onClose={() => setLeadModal(null)}
            onSave={(next) => void handleSaveLead(next)}
          />
        )}
        {closeLead && (
          <CloseLeadModal
            lead={closeLead}
            onClose={() => setCloseLead(null)}
            onConfirm={(reason, note) => void handleCloseLead(closeLead, reason, note)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 }}>
        <PrimaryBtn
          onClick={() => setLeadModal({ lead: null, isNew: true })}
          disabled={savingLead}
        >
          <PlusIcon /> {savingLead ? 'Saving…' : 'Add Lead'}
        </PrimaryBtn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Leads" value={stats.all} sub="All leads" onClick={() => setActiveTab('all')} />
        <StatCard label="Open" value={stats.open} sub="Ready / needs action" onClick={() => setActiveTab('open')} accent={BRAND.gray} />
        <StatCard label="In progress" value={stats.in_progress} sub="Active pipeline work" onClick={() => setActiveTab('in_progress')} accent={BRAND.blue} />
        <StatCard label="Converted" value={stats.converted} sub="Became accounts" onClick={() => setActiveTab('converted')} accent={BRAND.green} />
      </div>

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${BRAND.grayBorder}`, padding: '0 20px' }}>
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'open', label: 'Open' },
              { id: 'in_progress', label: 'In progress' },
              { id: 'converted', label: 'Converted' },
              { id: 'closed', label: 'Closed' },
            ] as const
          ).map((tab) => (
            <TabBtn
              key={tab.id}
              label={tab.label}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
          <div style={{ marginLeft: 'auto', position: 'relative', padding: '10px 0' }} ref={searchRef}>
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: BRAND.gray }}>
              <SearchIcon />
            </div>
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search leads..."
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
                {suggestions.map((l) => {
                  const display = resolveLeadDisplayStatus(l, contractSubmitActions);
                  return (
                  <div
                    key={l.id}
                    onClick={() => { setSelectedId(l.id); setShowSuggestions(false); }}
                    style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${BRAND.grayBorder}` }}
                    onMouseOver={(e) => (e.currentTarget.style.background = BRAND.grayLight)}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: BRAND.onAccent, flexShrink: 0 }}>
                      {l.companyFriendly.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark }}>{l.companyFriendly}</div>
                      <div style={{ fontSize: 11, color: BRAND.gray }}>
                        {primaryContact(l)?.name ? `Contact: ${primaryContact(l)!.name}` : 'No contact'}
                        {' · '}
                        {display.label}
                        {display.detail ? ` · ${display.detail}` : ''}
                      </div>
                    </div>
                    <StatusPill display={display} />
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: BRAND.grayLight }}>
              <Th>Created</Th>
              <Th>Lead</Th>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th>Decision Maker?</Th>
              <Th>What can we help with?</Th>
              <Th center>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: BRAND.gray }}>No leads found.</td></tr>
            ) : (
              filtered.map((l) => {
                const pc = primaryContact(l);
                const isDm = pc?.isDecisionMaker ?? false;
                const display = resolveLeadDisplayStatus(l, contractSubmitActions);
                return (
                  <tr
                    key={l.id}
                    style={{ borderBottom: `1px solid ${BRAND.grayBorder}`, cursor: 'pointer' }}
                    onClick={() => setSelectedId(l.id)}
                    onMouseOver={(e) => (e.currentTarget.style.background = BRAND.grayLight)}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '13px 16px', color: BRAND.gray, fontSize: 12 }}>{l.createdAt}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, color: BRAND.red, textDecoration: 'underline', textUnderlineOffset: 2 }}>{l.companyFriendly}</div>
                      <div style={{ fontSize: 11, color: BRAND.gray }}>{pc ? `${pc.name} · ${pc.email}` : 'No contact yet'}</div>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: BRAND.gray }}>{leadSourceLabel(l.source)}</td>
                    <td style={{ padding: '13px 16px' }}><StatusPill display={display} /></td>
                    <td style={{ padding: '13px 16px', color: isDm ? BRAND.green : BRAND.gray, fontWeight: 600 }}>{isDm ? 'Yes' : 'No'}</td>
                    <td style={{ padding: '13px 16px', color: BRAND.gray }}>{l.helpWith || '—'}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                        <ActionBtn onClick={() => setSelectedId(l.id)} title="Open"><EyeIcon /></ActionBtn>
                        <ActionBtn
                          onClick={(e) => {
                            e.stopPropagation();
                            setLeadModal({ lead: l, isNew: false });
                          }}
                          title="Edit"
                        >
                          <EditIcon />
                        </ActionBtn>
                        <ActionBtn
                          danger
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete lead \"${l.companyFriendly}\"?`)) setLeads((p) => p.filter((x) => x.id !== l.id));
                          }}
                        >
                          <TrashIcon />
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {leadModal && (
        <LeadFormModal
          lead={leadModal.lead}
          isNew={leadModal.isNew}
          onClose={() => setLeadModal(null)}
          onSave={(next) => void handleSaveLead(next)}
        />
      )}
      {closeLead && (
        <CloseLeadModal
          lead={closeLead}
          onClose={() => setCloseLead(null)}
          onConfirm={(reason, note) => void handleCloseLead(closeLead, reason, note)}
        />
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number | string; sub: string; onClick?: () => void; accent?: string }> = ({ label, value, sub, onClick, accent }) => (
  <div
    onClick={onClick}
    style={{
      background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`,
      borderLeft: accent ? `3px solid ${accent}` : undefined,
      borderRadius: 8, padding: '14px 18px',
      cursor: onClick ? 'pointer' : 'default', transition: 'all 0.15s',
    }}
    onMouseOver={(e) => onClick && (e.currentTarget.style.borderColor = accent || BRAND.red)}
    onMouseOut={(e) => onClick && (e.currentTarget.style.borderColor = BRAND.grayBorder)}
  >
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent || BRAND.gray, marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: BRAND.grayDark }}>{value}</div>
    <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>{sub}</div>
  </div>
);

export default LeadsView;

