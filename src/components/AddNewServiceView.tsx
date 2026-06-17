'use client';

// AddNewServiceView — redesigned "Add a Service" page.
// Renders 4 entry-point cards, live category search/filter, address lookup,
// and self-contained Upload + Quote modals. Brand tokens are inline (see
// IMPORT_INSTRUCTIONS) and can be swapped for shared constants later.

import React, { useState, useRef, useCallback } from 'react';

// ── Brand tokens — adjust to match your constants.ts ─────────
const R = {
  red:        '#C8281E',
  redDark:    '#8B1A12',
  redLight:   '#E8453B',
  grayDark:   '#1E1E1E',
  gray:       '#6B6B6B',
  grayLight:  '#F5F5F5',
  grayBorder: '#E2E2E2',
  white:      '#FFFFFF',
  green:      '#1A7A4A',
  greenLight: '#EAF7F0',
  amber:      '#B45309',
  blue:       '#1D4ED8',
};

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type ServiceCategory = 'all' | 'network' | 'ucaas' | 'ccaas' | 'security' | 'cloud' | 'iot' | 'commerce' | 'misc';

type ModalStage = 'upload' | 'processing' | 'result' | 'human-review' | 'confirm';

interface ServiceProfile {
  name: string;
  vendor: string;
  current: string;
  market: string;
  savings: string;
  note: string;
}

interface CategoryCard {
  id: ServiceCategory;
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  items: string;
  tags: string;
}

// ─────────────────────────────────────────────────────────────
// SERVICE DETECTION — Hank identifies from filename
// ─────────────────────────────────────────────────────────────
const SERVICE_PROFILES: Record<string, ServiceProfile> = {
  merchant: {
    name: 'Merchant Processing Statement',
    vendor: 'Detected from fee structure and processing rate format',
    current: '$1,860', market: '$1,210', savings: '$650/mo',
    note: 'Your effective processing rate is running higher than it should for your volume. There\'s real money here — enough to more than cover the platform fee. A 15-minute call with your Candid specialist is all it takes.',
  },
  internet: {
    name: 'Internet Service Invoice',
    vendor: 'Detected from service type and billing structure',
    current: '$420', market: '$280', savings: '$140/mo',
    note: 'Your internet rate has been creeping up. Current market pricing for comparable service is meaningfully lower — an easy win with a quick renewal conversation.',
  },
  ucaas: {
    name: 'UCaaS / Phone System Invoice',
    vendor: 'Detected from seat-based billing and feature set',
    current: '$1,250', market: '$750', savings: '$500/mo',
    note: 'Your per-seat cost is running well above current market rates. With contracts auto-renewing at legacy pricing, now is the ideal time to act.',
  },
  microsoft: {
    name: 'Microsoft 365 Subscription',
    vendor: 'Detected from license-based billing format',
    current: '$660', market: '$440', savings: '$220/mo',
    note: 'A few things jumped out immediately — you may have inactive licenses that can be removed right now with no contract change. Rightsize first, then we look at rate.',
  },
  security: {
    name: 'Security Services Invoice',
    vendor: 'Detected from service category and billing structure',
    current: '$890', market: '$620', savings: '$270/mo',
    note: 'Security spend is one of the most over-complicated categories we see. There\'s often significant redundancy between tools. Let\'s look at what you actually need vs. what you\'re paying for.',
  },
  cloud: {
    name: 'Cloud / Storage Invoice',
    vendor: 'Detected from usage-based billing format',
    current: '$540', market: '$380', savings: '$160/mo',
    note: 'Cloud billing is notoriously hard to read. Unused storage and orphaned resources are usually the culprits. A quick audit typically finds immediate savings.',
  },
};

const KEYWORD_MAP: Record<string, string[]> = {
  merchant:  ['merchant','square','stripe','processing','payment','pos','clover','toast','authorize','heartland','worldpay'],
  internet:  ['comcast','spectrum','att','verizon','cox','lumen','centurylink','frontier','internet','broadband','fiber'],
  ucaas:     ['ringcentral','vonage','dialpad','8x8','zoom phone','aircall','nextiva','teams','mitel','avaya','ucaas','sip','voice'],
  microsoft: ['microsoft','office 365','m365','sharepoint','exchange','azure','outlook'],
  security:  ['security','firewall','endpoint','sophos','crowdstrike','sentinel','soc','fortinet'],
  cloud:     ['aws','azure','google cloud','gcp','storage','backup','dropbox','hosting'],
};

function detectServiceType(filename: string): string {
  const lower = filename.toLowerCase();
  for (const [type, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(kw => lower.includes(kw))) return type;
  }
  return 'unknown';
}

// ─────────────────────────────────────────────────────────────
// CATEGORY DATA
// ─────────────────────────────────────────────────────────────
const CATEGORIES: CategoryCard[] = [
  {
    id: 'network', label: 'Network & Connectivity', accentColor: R.blue,
    items: 'SD-WAN · Broadband · Dedicated Fiber · Managed WiFi · Security · Remediation',
    tags: 'sd-wan broadband fiber internet wifi connectivity network security',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={R.blue} strokeWidth="1.5"><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M10.54 16.1a6 6 0 0 1 2.92 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
  },
  {
    id: 'ucaas', label: 'UCaaS / Phone Systems', accentColor: R.red,
    items: 'Voice · SMS · Video · Web Conferencing · Collaboration · IVR · SIP Trunks',
    tags: 'voice phone ucaas unified communications sip voip ringcentral vonage dialpad 8x8 zoom teams',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={R.red} strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.36 2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  },
  {
    id: 'ccaas', label: 'CCaaS / Contact Center', accentColor: R.amber,
    items: 'IVR · Analytics · Workforce Mgmt · Quality Mgmt · PCI · HIPAA · Gamification',
    tags: 'ccaas contact center ivr workforce analytics pci hipaa gamification call recording',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={R.amber} strokeWidth="1.5"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>,
  },
  {
    id: 'security', label: 'Security', accentColor: '#DC2626',
    items: 'Virtual CISO · Managed Firewall · Endpoint · Zero-Trust · SOC · Incident Response',
    tags: 'security firewall cyber ciso vulnerability endpoint protection zero trust vpn siem soc',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  },
  {
    id: 'cloud', label: 'Cloud & Storage', accentColor: '#0891B2',
    items: 'Public/Private Cloud · Storage · Managed O365 · IT Support · Cloud Migration · SaaS',
    tags: 'cloud aws azure google storage backup managed office microsoft saas disaster recovery',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0891B2" strokeWidth="1.5"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>,
  },
  {
    id: 'iot', label: 'IoT & Sensors', accentColor: '#059669',
    items: 'Sensors · Temperature · Pressure · Soil Moisture · Geo-Fence · Video · Reporting',
    tags: 'iot sensors temperature pressure reporting geo-fence video monitoring',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>,
  },
  {
    id: 'commerce', label: 'Commerce & Payments', accentColor: R.green,
    items: 'Payments · POS Hardware/Software · eCommerce · Logistics · Digital Web · Marketing',
    tags: 'payments merchant processing pos point of sale ecommerce logistics digital web clover toast square stripe',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={R.green} strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  },
  {
    id: 'misc', label: 'Misc & IT Field Services', accentColor: R.gray,
    items: 'Mobile · Expense Mgmt · Physical Security · Software · IT Field Services · 24/7 Help-Desk',
    tags: 'mobile expense physical security surveillance software email accounting crm it field services helpdesk',
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={R.gray} strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>,
  },
];

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
interface AddNewServiceViewProps {
  /** Called when user clicks "Ask Hank" — navigate to chat view */
  onOpenChat: () => void;
}

export const AddNewServiceView: React.FC<AddNewServiceViewProps> = ({ onOpenChat }) => {
  const [searchQuery, setSearchQuery]       = useState('');
  const [activeCategory, setActiveCategory] = useState<ServiceCategory>('all');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [quoteModalOpen, setQuoteModalOpen]   = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);

  const filteredCategories = CATEGORIES.filter(cat => {
    const catMatch = activeCategory === 'all' || cat.id === activeCategory;
    const q = searchQuery.toLowerCase();
    const searchMatch = !q || cat.tags.includes(q) || cat.label.toLowerCase().includes(q) || cat.items.toLowerCase().includes(q);
    return catMatch && searchMatch;
  });

  const scrollToCategories = () => {
    categoryRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div>
      {/* ── Four entry-point cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginBottom: 28 }}>
        <EntryCard
          accent={`linear-gradient(90deg,${R.redDark},${R.redLight})`}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={R.red} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
          title="Analyze an Existing Bill"
          description="Upload any invoice or statement. Hank identifies the service type, analyzes your current spend, and surfaces savings opportunities — automatically."
          cta="Upload invoice →"
          ctaColor={R.red}
          onClick={() => setUploadModalOpen(true)}
        />
        <EntryCard
          accent={`linear-gradient(90deg,${R.blue},#60A5FA)`}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={R.blue} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>}
          title="Need a New Service?"
          description="Starting a new business or adding a service you don't have yet? Tell us what you need and we'll build a custom quote — internet, phones, payments, security, and more."
          cta="Request a quote →"
          ctaColor={R.blue}
          onClick={() => setQuoteModalOpen(true)}
        />
        <EntryCard
          accent={`linear-gradient(90deg,${R.green},#34D399)`}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={R.green} strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>}
          title="Browse by Category"
          description="Explore every service category Candid supports — Network, UCaaS, CCaaS, Security, Cloud, Commerce, IoT, and more."
          cta="Browse all services →"
          ctaColor={R.green}
          onClick={scrollToCategories}
        />
        <EntryCard
          dark
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8453B" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
          title="Ask Hank"
          description="Not sure what you need or where to start? Describe your situation to Hank and he'll identify services, find savings, and walk you through your options."
          cta="Chat with Hank →"
          ctaColor="#E8453B"
          onClick={onOpenChat}
        />
      </div>

      {/* ── Search bar ── */}
      <div style={{ background: R.white, border: `1px solid ${R.grayBorder}`, borderRadius: 10, padding: '18px 24px', marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: R.gray, marginBottom: 10 }}>Search for a Service</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={R.gray} strokeWidth="2"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="e.g. phone system, internet, security, payments, Microsoft..."
              style={{ width: '100%', border: `1px solid ${R.grayBorder}`, borderRadius: 7, padding: '12px 16px 12px 36px', fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: R.grayDark, outline: 'none', transition: 'border-color 0.2s' }}
              onFocus={e => (e.target.style.borderColor = R.red)}
              onBlur={e => (e.target.style.borderColor = R.grayBorder)}
            />
          </div>
          <button
            onClick={() => {/* search already live via state */}}
            style={{ background: `linear-gradient(135deg,${R.redDark},${R.redLight})`, color: R.white, border: 'none', borderRadius: 7, padding: '12px 22px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Search
          </button>
        </div>
      </div>

      {/* ── Category pills + grid ── */}
      <div ref={categoryRef}>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {([
            { id: 'all',      label: 'All Categories' },
            { id: 'network',  label: 'Network' },
            { id: 'ucaas',    label: 'UCaaS' },
            { id: 'ccaas',    label: 'CCaaS' },
            { id: 'security', label: 'Security' },
            { id: 'cloud',    label: 'Cloud' },
            { id: 'iot',      label: 'IoT' },
            { id: 'commerce', label: 'Commerce' },
            { id: 'misc',     label: 'Misc & IT' },
          ] as { id: ServiceCategory; label: string }[]).map(pill => (
            <FilterPill
              key={pill.id}
              label={pill.label}
              active={activeCategory === pill.id}
              onClick={() => { setActiveCategory(pill.id); setSearchQuery(''); }}
            />
          ))}
        </div>

        {/* Category grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {filteredCategories.map(cat => (
            <CategoryCardComponent
              key={cat.id}
              cat={cat}
              onGetQuote={() => setUploadModalOpen(true)}
            />
          ))}
        </div>

        {filteredCategories.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: R.gray }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: R.grayDark, marginBottom: 6 }}>No exact match — let Hank help</div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>Can't find what you're looking for? Describe it to Hank and he'll find the right solution.</div>
            <button onClick={onOpenChat} style={{ background: `linear-gradient(135deg,${R.redDark},${R.redLight})`, color: R.white, border: 'none', borderRadius: 7, padding: '10px 22px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Ask Hank →
            </button>
          </div>
        )}

        {/* Address lookup */}
        <div style={{ background: R.white, border: `1px solid ${R.grayBorder}`, borderRadius: 10, marginTop: 24, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: `1px solid ${R.grayBorder}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, background: 'rgba(200,40,30,0.08)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={R.red} strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: R.grayDark }}>Check Internet Availability by Address</div>
              <div style={{ fontSize: 12, color: R.gray }}>See what providers are available — powered by our Intelisys CableFinder network</div>
            </div>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <AddressLookup />
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {uploadModalOpen && (
        <UploadModal onClose={() => setUploadModalOpen(false)} onHumanReview={() => setUploadModalOpen(false)} />
      )}
      {quoteModalOpen && (
        <QuoteModal onClose={() => setQuoteModalOpen(false)} />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ENTRY POINT CARD
// ─────────────────────────────────────────────────────────────
interface EntryCardProps {
  accent?: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  ctaColor: string;
  onClick: () => void;
  dark?: boolean;
}

const EntryCard: React.FC<EntryCardProps> = ({ accent, icon, title, description, cta, ctaColor, onClick, dark }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: dark ? R.grayDark : R.white,
        border: `1px solid ${dark ? R.grayDark : R.grayBorder}`,
        borderRadius: 10, padding: 24, cursor: 'pointer',
        transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
        opacity: dark && hovered ? 0.9 : 1,
        borderColor: !dark && hovered ? R.red : dark ? R.grayDark : R.grayBorder,
        boxShadow: !dark && hovered ? '0 4px 20px rgba(200,40,30,0.08)' : 'none',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent || `linear-gradient(90deg,${R.redDark},${R.redLight})` }} />
      <div style={{ marginBottom: 14 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: dark ? R.white : R.grayDark, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: dark ? '#888' : R.gray, lineHeight: 1.6 }}>{description}</div>
      <div style={{ marginTop: 14, fontSize: 11, fontWeight: 600, color: ctaColor }}>{cta}</div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// FILTER PILL
// ─────────────────────────────────────────────────────────────
const FilterPill: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{
    padding: '7px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 500,
    border: `1px solid ${active ? R.red : R.grayBorder}`,
    background: active ? R.red : R.white,
    color: active ? R.white : R.gray,
    fontFamily: "'DM Sans',sans-serif",
    transition: 'all 0.15s',
  }}>{label}</button>
);

// ─────────────────────────────────────────────────────────────
// CATEGORY CARD
// ─────────────────────────────────────────────────────────────
const CategoryCardComponent: React.FC<{ cat: CategoryCard; onGetQuote: () => void }> = ({ cat, onGetQuote }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: R.white, borderRadius: 10, padding: 18, cursor: 'pointer',
        border: `1px solid ${hovered ? R.red : R.grayBorder}`,
        boxShadow: hovered ? '0 4px 20px rgba(200,40,30,0.08)' : 'none',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${cat.accentColor}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        {cat.icon}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: R.grayDark }}>{cat.label}</div>
      <div style={{ fontSize: 11, color: R.gray, lineHeight: 1.5 }}>{cat.items}</div>
      <div onClick={onGetQuote} style={{ fontSize: 11, fontWeight: 700, color: R.red, marginTop: 6 }}>Get a Quote →</div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ADDRESS LOOKUP
// ─────────────────────────────────────────────────────────────
const AddressLookup: React.FC = () => {
  const [street, setStreet] = useState('');
  const [city, setCity]     = useState('');
  const [state, setState]   = useState('');
  const [zip, setZip]       = useState('');
  const [results, setResults] = useState(false);

  const run = () => {
    if (street && city && zip) setResults(true);
    else alert('Please fill in street, city, and ZIP.');
  };

  const inputStyle: React.CSSProperties = { border: `1px solid ${R.grayBorder}`, borderRadius: 6, padding: '10px 12px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: R.grayDark, outline: 'none' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Street Address" style={{ ...inputStyle, flex: 2, minWidth: 160 }} />
        <input value={city}   onChange={e => setCity(e.target.value)}   placeholder="City"           style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
        <input value={state}  onChange={e => setState(e.target.value)}  placeholder="State"          style={{ ...inputStyle, width: 70 }} />
        <input value={zip}    onChange={e => setZip(e.target.value)}    placeholder="ZIP"            style={{ ...inputStyle, width: 90 }} />
        <button onClick={run} style={{ background: `linear-gradient(135deg,${R.redDark},${R.redLight})`, color: R.white, border: 'none', borderRadius: 6, padding: '10px 20px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Check →
        </button>
      </div>
      {results && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: R.gray, marginBottom: 10 }}>Available Providers</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
            {['Comcast Business', 'AT&T Business', 'Spectrum Business'].map(p => (
              <div key={p} style={{ background: R.grayLight, border: `1px solid ${R.grayBorder}`, borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: R.grayDark, marginBottom: 2 }}>{p}</div>
                <div style={{ fontSize: 11, color: R.green, fontWeight: 600 }}>Candid pricing available</div>
              </div>
            ))}
          </div>
          <div style={{ background: R.greenLight, border: '1px solid #A7F3D0', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: R.green }}>
            Candid negotiated pricing available for all providers shown. Schedule a call to lock in your rate.
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// UPLOAD MODAL — Invoice Analysis
// ─────────────────────────────────────────────────────────────
interface UploadModalProps {
  onClose: () => void;
  onHumanReview: () => void;
}

const PROCESSING_MESSAGES = [
  'Reading your bill...',
  'Identifying service type...',
  'Comparing to market rates...',
  'Running analysis...',
  'Almost there...',
];

const UploadModal: React.FC<UploadModalProps> = ({ onClose }) => {
  const [stage, setStage] = useState<ModalStage>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [processingMsg, setProcessingMsg] = useState(PROCESSING_MESSAGES[0]);
  const [detectedProfile, setDetectedProfile] = useState<ServiceProfile | null>(null);
  const [email, setEmail] = useState('');
  const zoneRef = useRef<HTMLDivElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (zoneRef.current) zoneRef.current.style.borderColor = R.grayBorder;
    addFiles(Array.from(e.dataTransfer.files));
  }, []);

  const addFiles = (newFiles: File[]) => {
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...newFiles.filter(f => !names.has(f.name))];
    });
  };

  const analyze = () => {
    if (files.length === 0) { alert('Please upload at least one file.'); return; }
    setStage('processing');
    let step = 0;
    const iv = setInterval(() => {
      step++;
      if (step < PROCESSING_MESSAGES.length) setProcessingMsg(PROCESSING_MESSAGES[step]);
    }, 650);
    setTimeout(() => {
      clearInterval(iv);
      const detected = detectServiceType(files[0]?.name ?? '');
      if (detected === 'unknown') {
        setStage('human-review');
      } else {
        setDetectedProfile(SERVICE_PROFILES[detected] ?? null);
        setStage('result');
      }
    }, 3500);
  };

  return (
    <ModalOverlay onClose={onClose}>
      {/* Header */}
      <div style={{ background: R.grayDark, padding: '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${R.redDark},${R.redLight})` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, background: `linear-gradient(135deg,${R.redDark},${R.redLight})`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, color: R.white }}>✦</div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: R.white }}>Add a Service</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>Hank is ready to take a look</div>
          </div>
        </div>
        <button onClick={onClose} style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>

      <div style={{ padding: 28 }}>
        {/* STAGE: UPLOAD */}
        {stage === 'upload' && (
          <>
            <div
              ref={zoneRef}
              onDragOver={e => { e.preventDefault(); if (zoneRef.current) zoneRef.current.style.borderColor = R.red; }}
              onDragLeave={() => { if (zoneRef.current) zoneRef.current.style.borderColor = R.grayBorder; }}
              onDrop={handleDrop}
              onClick={() => document.getElementById('modal-file-input')?.click()}
              style={{ border: `2px dashed ${R.grayBorder}`, borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: R.grayLight, transition: 'all 0.2s', marginBottom: 12, position: 'relative' }}
            >
              <input id="modal-file-input" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                onChange={e => addFiles(Array.from(e.target.files ?? []))} />
              <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: R.grayDark, marginBottom: 6 }}>Drag & drop your bills here</div>
              <div style={{ fontSize: 12, color: R.gray, lineHeight: 1.7, marginBottom: 12 }}>
                Invoices · Statements · Credit card CSVs · Bank statements<br />
                PDF · Image · CSV · Excel — we'll take anything
              </div>
              <div style={{ display: 'inline-block', background: `linear-gradient(135deg,${R.redDark},${R.redLight})`, color: R.white, borderRadius: 7, padding: '9px 22px', fontSize: 13, fontWeight: 600 }}>Select Files</div>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: R.white, border: `1px solid ${R.grayBorder}`, borderRadius: 7, padding: '9px 12px', marginBottom: 6 }}>
                    <span style={{ flex: 1, fontSize: 13, color: R.grayDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: R.gray }}>{(f.size / 1024).toFixed(0)} KB</span>
                    <span onClick={() => setFiles(p => p.filter((_, j) => j !== i))} style={{ color: R.gray, cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</span>
                  </div>
                ))}
              </div>
            )}

            {/* Hank quip */}
            <div style={{ background: 'rgba(200,40,30,0.05)', border: '1px solid rgba(200,40,30,0.12)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, fontSize: 12, color: R.gray, lineHeight: 1.6 }}>
              <span style={{ fontSize: 16 }}>✦</span>
              <div><strong style={{ color: R.grayDark }}>Hi, I'm Hank.</strong> Upload any invoice, bill, or statement — even a credit card CSV. I'll figure out what it is, what you're paying, and whether you're getting a fair deal. No judgment. Well, maybe a little judgment. On Comcast.</div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={analyze} style={{ flex: 1, background: `linear-gradient(135deg,${R.redDark},${R.redLight})`, color: R.white, border: 'none', borderRadius: 7, padding: 13, fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Analyze My Bills →
              </button>
              <button onClick={onClose} style={{ background: R.grayLight, border: `1px solid ${R.grayBorder}`, borderRadius: 7, padding: '13px 18px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: R.grayDark, cursor: 'pointer' }}>
                Maybe Later
              </button>
            </div>
          </>
        )}

        {/* STAGE: PROCESSING */}
        {stage === 'processing' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: R.grayDark, marginBottom: 16 }}>Hank is on it.</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i === 1 ? R.gray : R.red, display: 'inline-block', animation: `bounce 1.2s infinite ${i * 0.2}s` }} />
              ))}
            </div>
            <div style={{ fontSize: 13, color: R.gray }}>{processingMsg}</div>
          </div>
        )}

        {/* STAGE: RESULT */}
        {stage === 'result' && detectedProfile && (
          <>
            <div style={{ background: `linear-gradient(135deg,${R.grayDark},#2A1A1A)`, borderRadius: 10, padding: '20px 22px', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${R.redDark},${R.redLight})` }} />
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: R.redLight, marginBottom: 6 }}>✦ Hank identified this as</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: R.white, marginBottom: 4 }}>{detectedProfile.name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{detectedProfile.vendor}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Current Monthly', value: detectedProfile.current, color: R.red },
                { label: 'Market Rate',     value: detectedProfile.market,  color: R.grayDark },
                { label: 'Est. Savings',    value: detectedProfile.savings,  color: R.green },
              ].map(s => (
                <div key={s.label} style={{ background: R.grayLight, border: `1px solid ${R.grayBorder}`, borderRadius: 8, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: R.gray, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ background: R.greenLight, border: '1px solid #A7F3D0', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: R.green, lineHeight: 1.6, marginBottom: 16 }}>
              ✦ <strong>Hank's take:</strong> {detectedProfile.note}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, background: `linear-gradient(135deg,${R.redDark},${R.redLight})`, color: R.white, border: 'none', borderRadius: 7, padding: 12, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Schedule a Review Call
              </button>
              <button onClick={() => setStage('human-review')} style={{ background: R.grayLight, border: `1px solid ${R.grayBorder}`, borderRadius: 7, padding: '12px 16px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: R.grayDark, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Don't want to wait? →
              </button>
            </div>
          </>
        )}

        {/* STAGE: HUMAN REVIEW */}
        {stage === 'human-review' && (
          <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: R.grayDark, marginBottom: 8 }}>Sending to Your Candid Team</div>
            <div style={{ fontSize: 13, color: R.gray, lineHeight: 1.65, marginBottom: 20, maxWidth: 380, margin: '0 auto 20px' }}>
              Your bills are heading to a real human on the Candid team. We'll have a full review ready within 24 hours.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, margin: '0 auto' }}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Your email address"
                style={{ border: `1px solid ${R.grayBorder}`, borderRadius: 7, padding: '12px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: R.grayDark, outline: 'none', textAlign: 'center' }} />
              <button onClick={() => setStage('confirm')} style={{ background: `linear-gradient(135deg,${R.redDark},${R.redLight})`, color: R.white, border: 'none', borderRadius: 7, padding: 12, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Send My Bills for Review →
              </button>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: R.gray, cursor: 'pointer' }}>
                Skip for now — I'll come back
              </button>
            </div>
          </div>
        )}

        {/* STAGE: CONFIRM */}
        {stage === 'confirm' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ width: 48, height: 48, background: R.greenLight, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={R.green} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: R.grayDark, marginBottom: 8 }}>You're all set.</div>
            <div style={{ fontSize: 13, color: R.gray, lineHeight: 1.7, marginBottom: 20 }}>
              Your Candid team has your bills and will be in touch within 24 hours. Hank added this service to your dashboard.
            </div>
            <button onClick={onClose} style={{ background: `linear-gradient(135deg,${R.redDark},${R.redLight})`, color: R.white, border: 'none', borderRadius: 7, padding: '11px 28px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Back to My Services
            </button>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
};

// ─────────────────────────────────────────────────────────────
// QUOTE MODAL — Request a Quote
// ─────────────────────────────────────────────────────────────
const QUOTE_SERVICES = [
  'Internet / Connectivity', 'Phone System / UCaaS', 'Merchant Processing',
  'Security', 'Cloud / Storage', 'Microsoft 365 / Google',
  'Contact Center / CCaaS', 'IT Support', 'Not sure — advise me',
];

const QuoteModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [name, setName]       = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail]     = useState('');
  const [phone, setPhone]     = useState('');
  const [notes, setNotes]     = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const toggleService = (s: string) => setSelected(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const submit = () => {
    if (!name || !company || !email || !phone) { alert('Please fill in all required fields.'); return; }
    setConfirmed(true);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ background: R.grayDark, padding: '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${R.blue},#60A5FA)` }} />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: R.white }}>Request a Quote</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>New service or starting a new business — we'll build the right solution for you.</div>
        </div>
        <button onClick={onClose} style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>

      <div style={{ padding: 28 }}>
        {!confirmed ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Full Name *',     val: name,    set: setName,    ph: 'Jane Smith' },
                { label: 'Company Name *',  val: company, set: setCompany, ph: 'Acme Corp' },
                { label: 'Email *',         val: email,   set: setEmail,   ph: 'jane@acme.com' },
                { label: 'Phone *',         val: phone,   set: setPhone,   ph: '(555) 000-0000' },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: R.gray, letterSpacing: '0.06em', marginBottom: 5 }}>{f.label}</label>
                  <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                    style={{ width: '100%', border: `1px solid ${R.grayBorder}`, borderRadius: 6, padding: '10px 12px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: R.grayDark, outline: 'none' }} />
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: R.gray, letterSpacing: '0.06em', marginBottom: 8 }}>What services are you looking for? <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(select all that apply)</span></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {QUOTE_SERVICES.map(s => (
                  <div key={s} onClick={() => toggleService(s)}
                    className={selected.includes(s) ? 'q-pill selected' : 'q-pill'}
                    style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${selected.includes(s) ? R.blue : R.grayBorder}`, background: selected.includes(s) ? '#EFF6FF' : R.white, color: selected.includes(s) ? R.blue : R.gray, fontSize: 12, fontWeight: selected.includes(s) ? 600 : 500, cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'DM Sans',sans-serif" }}>
                    {s}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: R.gray, letterSpacing: '0.06em', marginBottom: 5 }}>Tell us more <span style={{ fontWeight: 400, fontStyle: 'italic' }}>(optional)</span></label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Starting a new business? Expanding locations? Unhappy with a current provider?"
                style={{ width: '100%', border: `1px solid ${R.grayBorder}`, borderRadius: 6, padding: '10px 12px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: R.grayDark, outline: 'none', resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={submit} style={{ flex: 1, background: `linear-gradient(135deg,${R.blue},#3B82F6)`, color: R.white, border: 'none', borderRadius: 7, padding: 12, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Submit Quote Request →
              </button>
              <button onClick={onClose} style={{ background: R.grayLight, border: `1px solid ${R.grayBorder}`, borderRadius: 7, padding: '12px 16px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: R.grayDark, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ width: 48, height: 48, background: R.greenLight, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={R.green} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: R.grayDark, marginBottom: 8 }}>Quote Request Received</div>
            <div style={{ fontSize: 13, color: R.gray, lineHeight: 1.7, marginBottom: 20, maxWidth: 380, margin: '0 auto 20px' }}>
              Thank you, <strong>{name}</strong>. A Candid specialist will reach out to <strong>{email}</strong> within 1 business day{selected.length > 0 ? ` with your custom quote for: ${selected.join(', ')}` : ''}.
            </div>
            <button onClick={onClose} style={{ background: `linear-gradient(135deg,${R.blue},#3B82F6)`, color: R.white, border: 'none', borderRadius: 7, padding: '11px 28px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Done</button>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
};

// ─────────────────────────────────────────────────────────────
// MODAL OVERLAY (shared)
// ─────────────────────────────────────────────────────────────
const ModalOverlay: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <div
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
  >
    <div style={{ background: R.white, borderRadius: 14, width: 560, maxWidth: '95vw', boxShadow: '0 24px 80px rgba(0,0,0,0.28)', overflow: 'hidden', animation: 'modalIn 0.25s ease forwards' }}>
      {children}
    </div>
  </div>
);
