'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

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
};

const newId = () => `id-${Math.random().toString(36).slice(2, 10)}`;

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

const StatusPill: React.FC<{ status: LeadStatus }> = ({ status }) => {
  const map: Record<LeadStatus, { bg: string; color: string; label: string }> = {
    new: { bg: 'var(--gray-light)', color: BRAND.gray, label: 'New' },
    contacted: { bg: 'var(--blue-light)', color: BRAND.blue, label: 'Contacted' },
    qualified: { bg: 'var(--green-light)', color: BRAND.green, label: 'Qualified' },
    inactive: { bg: 'rgba(225,29,72,0.12)', color: BRAND.red, label: 'Inactive' },
  };
  const s = map[status];
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  );
};

const iconBase = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const PlusIcon = () => (<svg {...iconBase}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const SearchIcon = () => (<svg {...iconBase}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);
const EyeIcon = () => (<svg {...iconBase}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
const TrashIcon = () => (<svg {...iconBase}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
const EditIcon = () => (<svg {...iconBase}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);
const ChevronLeftIcon = () => (<svg {...iconBase}><polyline points="15 18 9 12 15 6" /></svg>);

const PrimaryBtn: React.FC<{ onClick?: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: `linear-gradient(135deg, ${BRAND.redDark}, ${BRAND.redLight})`,
      color: BRAND.onAccent, border: 'none', borderRadius: 6,
      padding: '9px 16px', fontFamily: "'DM Sans', sans-serif",
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
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
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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

export const LeadsView: React.FC<{ portalLeads?: Lead[] }> = ({ portalLeads = [] }) => {
  const mergedSeed = useMemo(() => {
    const dynamicIds = new Set(portalLeads.map((l) => l.id));
    return [...portalLeads, ...INITIAL_LEADS.filter((l) => !dynamicIds.has(l.id))];
  }, [portalLeads]);
  const [leads, setLeads] = useState<Lead[]>(mergedSeed);
  const [activeTab, setActiveTab] = useState<LeadStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Lead[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leadModal, setLeadModal] = useState<{ lead: Lead | null; isNew: boolean } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLeads(mergedSeed);
  }, [mergedSeed]);

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
    .filter((l) => (activeTab === 'all' || l.status === activeTab))
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
    new: leads.filter((l) => computeStatus(l) === 'new').length,
    contacted: leads.filter((l) => computeStatus(l) === 'contacted').length,
    qualified: leads.filter((l) => computeStatus(l) === 'qualified').length,
  };

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
              <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.6 }}>
                {selected.companyLegal || 'Legal name not set'}<br />
                {selected.website ? selected.website.replace(/^https?:\/\//, '') : 'Website not set'}<br />
                {formatLocation(pl)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <button
                onClick={() => setLeadModal({ lead: selected, isNew: false })}
                style={{ background: 'rgba(255,255,255,0.08)', color: BRAND.onAccent, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '9px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                <EditIcon /> Edit
              </button>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <StatusPill status={computeStatus(selected)} />
          </div>
        </div>

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

        {leadModal && (
          <LeadFormModal
            lead={leadModal.lead}
            isNew={leadModal.isNew}
            onClose={() => setLeadModal(null)}
            onSave={(next) => {
              setLeads((prev) => {
                const exists = prev.some((l) => l.id === next.id);
                return exists ? prev.map((l) => (l.id === next.id ? next : l)) : [next, ...prev];
              });
              setLeadModal(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 }}>
        <PrimaryBtn onClick={() => setLeadModal({ lead: null, isNew: true })}>
          <PlusIcon /> Add Lead
        </PrimaryBtn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Leads" value={stats.all} sub="All pipeline" onClick={() => setActiveTab('all')} />
        <StatCard label="New" value={stats.new} sub="Needs outreach" onClick={() => setActiveTab('new')} accent={BRAND.gray} />
        <StatCard label="Contacted" value={stats.contacted} sub="In progress" onClick={() => setActiveTab('contacted')} accent={BRAND.blue} />
        <StatCard label="Qualified" value={stats.qualified} sub="Decision maker + need" onClick={() => setActiveTab('qualified')} accent={BRAND.green} />
      </div>

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${BRAND.grayBorder}`, padding: '0 20px' }}>
          {(['all', 'new', 'contacted', 'qualified', 'inactive'] as const).map((tab) => (
            <TabBtn
              key={tab}
              label={tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
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
                {suggestions.map((l) => (
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
                      <div style={{ fontSize: 11, color: BRAND.gray }}>{primaryContact(l)?.name ?? '—'} · {computeStatus(l)}</div>
                    </div>
                    <StatusPill status={computeStatus(l)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: BRAND.grayLight }}>
              <Th>Created</Th>
              <Th>Lead</Th>
              <Th>Status</Th>
              <Th>Decision Maker?</Th>
              <Th>What can we help with?</Th>
              <Th center>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: BRAND.gray }}>No leads found.</td></tr>
            ) : (
              filtered.map((l) => {
                const pc = primaryContact(l);
                const isDm = pc?.isDecisionMaker ?? false;
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
                    <td style={{ padding: '13px 16px' }}><StatusPill status={l.status} /></td>
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
          onSave={(next) => {
            setLeads((prev) => {
              const exists = prev.some((l) => l.id === next.id);
              return exists ? prev.map((l) => (l.id === next.id ? next : l)) : [next, ...prev];
            });
            setLeadModal(null);
          }}
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

