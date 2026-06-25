import type { AppIconName } from '@/components/AppIcon';
import type { ProviderCategory } from '@/lib/provider-categories';

/** Customer-facing solution categories shown in "Find Solutions". */
export type SolutionCategoryId =
  | 'payments'
  | 'ucaas'
  | 'cloud'
  | 'colocation'
  | 'connectivity'
  | 'contact_center'
  | 'international'
  | 'iot'
  | 'other'
  | 'sdwan'
  | 'security'
  | 'tem'
  | 'voice'
  | 'wan'
  | 'wireless';

export type SolutionCategory = {
  id: SolutionCategoryId;
  label: string;
  icon: AppIconName;
  blurb: string;
};

export const SOLUTION_CATEGORIES: SolutionCategory[] = [
  { id: 'payments', label: 'Payments', icon: 'card', blurb: 'Card processing, ACH & point of sale' },
  { id: 'ucaas', label: 'UCaaS', icon: 'messages', blurb: 'Cloud phones, chat & collaboration' },
  { id: 'cloud', label: 'Cloud Services', icon: 'desktop', blurb: 'Infrastructure, storage & SaaS' },
  { id: 'colocation', label: 'Colocation', icon: 'building', blurb: 'Data center space, power & cross-connects' },
  { id: 'connectivity', label: 'Connectivity', icon: 'broadcast', blurb: 'Internet, fiber & broadband' },
  { id: 'contact_center', label: 'Contact Center', icon: 'specialist', blurb: 'CCaaS, IVR & customer experience' },
  { id: 'international', label: 'International', icon: 'roadmap', blurb: 'Global connectivity & services' },
  { id: 'iot', label: 'Internet of Things (IoT)', icon: 'bolt', blurb: 'Sensors, asset tracking & connectivity' },
  { id: 'sdwan', label: 'SD-WAN', icon: 'link', blurb: 'Software-defined networking & edge' },
  { id: 'security', label: 'Security', icon: 'lock', blurb: 'Cybersecurity, compliance & monitoring' },
  { id: 'tem', label: 'Telecom Expense Management', icon: 'chart', blurb: 'Audit, optimize & manage telecom spend' },
  { id: 'voice', label: 'Voice', icon: 'mobile', blurb: 'SIP, PRI & POTS replacement' },
  { id: 'wan', label: 'Wide Area Networks', icon: 'broadcast', blurb: 'MPLS, VPLS & global backbone' },
  { id: 'wireless', label: 'Wireless', icon: 'mobile', blurb: '5G, failover & managed mobility' },
  { id: 'other', label: 'Other Services', icon: 'services', blurb: 'Digital signage, NOC, telehealth & more' },
];

export function solutionCategoryLabel(id: string): string {
  return SOLUTION_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Maps an internal provider_category to a customer-facing solution category. */
export function providerCategoryToSolution(
  category?: ProviderCategory | string | null,
): SolutionCategoryId {
  switch (category) {
    case 'merchant_services':
    case 'payments_ach':
      return 'payments';
    case 'ucaas':
      return 'ucaas';
    case 'ccaas':
      return 'contact_center';
    case 'mobility':
      return 'wireless';
    case 'security':
      return 'security';
    case 'cloud_saas':
      return 'cloud';
    case 'internet':
      return 'connectivity';
    case 'hardware':
    case 'managed_it':
    default:
      return 'other';
  }
}

export type CatalogSupplier = {
  name: string;
  website?: string;
  categories: SolutionCategoryId[];
  features: string[];
  /** Optional pricing note, when known. */
  pricing?: string;
  /** 'candid' = in Candid's network/system; 'network' = available via Candid's supplier network. */
  source: 'candid' | 'network';
};

/**
 * Curated reference suppliers, supplementing the providers in our own system.
 * Sourced from Candid's supplier network (Telarus: https://www.telarus.com/suppliers/).
 */
export const CATALOG_SUPPLIERS: CatalogSupplier[] = [
  // ── UCaaS ──
  { name: 'RingCentral', website: 'https://www.ringcentral.com', categories: ['ucaas', 'voice'], features: ['Cloud phone + video + SMS', 'Microsoft Teams integration', 'Global coverage'], source: 'network' },
  { name: '8x8', website: 'https://www.8x8.com', categories: ['ucaas', 'contact_center'], features: ['UCaaS + CCaaS in one platform', 'Global voice', 'Analytics'], source: 'network' },
  { name: 'Nextiva', website: 'https://www.nextiva.com', categories: ['ucaas', 'voice'], features: ['Business phone + collaboration', 'CRM tools', 'US-based support'], source: 'network' },
  { name: 'Zoom Phone', website: 'https://www.zoom.com', categories: ['ucaas'], features: ['Cloud PBX', 'Native Zoom Meetings', 'Global dial plans'], source: 'network' },
  { name: 'Dialpad', website: 'https://www.dialpad.com', categories: ['ucaas', 'contact_center'], features: ['AI call recaps & transcription', 'UCaaS + CCaaS', 'Built-in Ai'], source: 'network' },

  // ── Cloud ──
  { name: '11:11 Systems', website: 'https://1111systems.com', categories: ['cloud', 'colocation'], features: ['IaaS & DRaaS', 'Managed cloud', 'Backup as a service'], source: 'network' },
  { name: 'Microsoft Azure', website: 'https://azure.microsoft.com', categories: ['cloud'], features: ['IaaS / PaaS', 'Global regions', 'Hybrid cloud'], source: 'network' },
  { name: 'Amazon Web Services', website: 'https://aws.amazon.com', categories: ['cloud'], features: ['Compute, storage, database', 'Global scale', 'Serverless'], source: 'network' },
  { name: '365 Data Centers', website: 'https://www.365datacenters.com', categories: ['cloud', 'colocation', 'connectivity'], features: ['Colocation + cloud', 'Network services', 'Edge footprint'], source: 'network' },

  // ── Colocation ──
  { name: 'Flexential', website: 'https://www.flexential.com', categories: ['colocation', 'cloud'], features: ['Colocation & interconnection', 'Hybrid IT', 'Compliance-ready'], source: 'network' },
  { name: 'Cologix', website: 'https://www.cologix.com', categories: ['colocation'], features: ['Network-neutral data centers', 'Cloud on-ramps', 'Scalable space/power'], source: 'network' },

  // ── Connectivity ──
  { name: 'Comcast Business', website: 'https://business.comcast.com', categories: ['connectivity', 'voice'], features: ['Broadband & fiber', 'Business voice', 'Wide footprint'], source: 'network' },
  { name: 'Spectrum Business', website: 'https://www.spectrum.com/business', categories: ['connectivity'], features: ['Cable & fiber internet', 'Business voice', 'No data caps'], source: 'network' },
  { name: 'Lumen', website: 'https://www.lumen.com', categories: ['connectivity', 'wan', 'voice'], features: ['Dedicated internet', 'Global fiber network', 'Edge & security'], source: 'network' },
  { name: 'AT&T Business', website: 'https://www.business.att.com', categories: ['connectivity', 'wireless', 'wan'], features: ['Fiber & wireless', 'Nationwide coverage', 'Managed services'], source: 'network' },

  // ── Contact Center ──
  { name: 'Five9', website: 'https://www.five9.com', categories: ['contact_center'], features: ['Cloud contact center', 'AI & IVR', 'Omnichannel'], source: 'network' },
  { name: 'NICE CXone', website: 'https://www.nice.com', categories: ['contact_center'], features: ['CCaaS platform', 'WFM & analytics', 'AI automation'], source: 'network' },
  { name: 'Genesys', website: 'https://www.genesys.com', categories: ['contact_center'], features: ['Experience orchestration', 'AI-powered routing', 'Omnichannel'], source: 'network' },

  // ── International ──
  { name: 'Expereo', website: 'https://www.expereo.com', categories: ['international', 'connectivity', 'wan'], features: ['Global internet & SD-WAN', 'Managed networks', '190+ countries'], source: 'network' },
  { name: 'GlobalGig', website: 'https://globalgig.com', categories: ['international', 'wireless', 'connectivity'], features: ['Global connectivity', 'Managed wireless', 'Single invoice'], source: 'network' },

  // ── IoT ──
  { name: 'KORE Wireless', website: 'https://www.korewireless.com', categories: ['iot', 'wireless'], features: ['IoT connectivity', 'Device management', 'Global SIM'], source: 'network' },
  { name: 'Abundant IoT', website: 'https://www.telarus.com/suppliers/', categories: ['iot'], features: ['Asset tracking', 'Sensors & hardware', 'Managed IoT'], source: 'network' },

  // ── SD-WAN ──
  { name: 'Cato Networks', website: 'https://www.catonetworks.com', categories: ['sdwan', 'security'], features: ['SASE platform', 'Global private backbone', 'Built-in security'], source: 'network' },
  { name: 'Bigleaf Networks', website: 'https://www.bigleaf.net', categories: ['sdwan', 'connectivity'], features: ['Plug-and-play SD-WAN', 'Intelligent failover', 'Simple deployment'], source: 'network' },
  { name: 'Fortinet', website: 'https://www.fortinet.com', categories: ['sdwan', 'security'], features: ['Secure SD-WAN', 'Next-gen firewall', 'Unified security'], source: 'network' },
  { name: 'Aryaka', website: 'https://www.aryaka.com', categories: ['sdwan', 'wan'], features: ['Managed SD-WAN & SASE', 'Global private network', 'Fully managed'], source: 'network' },

  // ── Security ──
  { name: 'Arctic Wolf', website: 'https://arcticwolf.com', categories: ['security'], features: ['Managed detection & response', '24/7 SOC', 'Risk management'], source: 'network' },
  { name: 'CrowdStrike', website: 'https://www.crowdstrike.com', categories: ['security'], features: ['Endpoint protection', 'Threat intelligence', 'Cloud-native'], source: 'network' },
  { name: 'SentinelOne', website: 'https://www.sentinelone.com', categories: ['security'], features: ['Autonomous endpoint security', 'XDR platform', 'AI-driven'], source: 'network' },

  // ── Telecom Expense Management ──
  { name: 'Sakon', website: 'https://www.sakon.com', categories: ['tem'], features: ['Telecom & mobility expense', 'Invoice automation', 'Inventory management'], source: 'network' },
  { name: 'Calero', website: 'https://www.calero.com', categories: ['tem'], features: ['Technology expense management', 'Usage optimization', 'Spend visibility'], source: 'network' },

  // ── Voice ──
  { name: 'Bandwidth', website: 'https://www.bandwidth.com', categories: ['voice'], features: ['SIP trunking', 'Programmable voice', 'E-911'], source: 'network' },
  { name: 'Intrado', website: 'https://www.intrado.com', categories: ['voice'], features: ['Cloud voice & E-911', 'Conferencing', 'Notifications'], source: 'network' },

  // ── WAN ──
  { name: 'GTT', website: 'https://www.gtt.net', categories: ['wan', 'connectivity', 'international'], features: ['Global MPLS & SD-WAN', 'Tier-1 IP backbone', 'Managed networking'], source: 'network' },
  { name: 'Megaport', website: 'https://www.megaport.com', categories: ['wan', 'cloud'], features: ['Network as a service', 'Cloud on-ramps', 'On-demand bandwidth'], source: 'network' },

  // ── Wireless ──
  { name: 'Verizon Business', website: 'https://www.verizon.com/business', categories: ['wireless', 'connectivity'], features: ['5G & LTE', 'Nationwide coverage', 'Fixed wireless'], source: 'network' },
  { name: 'T-Mobile for Business', website: 'https://www.t-mobile.com/business', categories: ['wireless'], features: ['5G business internet', 'Mobility plans', 'Failover'], source: 'network' },
  { name: 'OptConnect', website: 'https://optconnect.com', categories: ['wireless', 'iot'], features: ['Managed wireless', 'Failover connectivity', 'Fully managed SIM'], source: 'network' },

  // ── Other ──
  { name: 'Telarus Supplier Network', website: 'https://www.telarus.com/suppliers/', categories: ['other'], features: ['300+ vetted suppliers', 'Digital signage, NOC, telehealth', 'Ask Candid to match you'], source: 'network' },
];

export type SolutionSupplier = CatalogSupplier;

/** Returns suppliers (system + curated) for a category, system ones first. */
export function suppliersForCategory(
  category: SolutionCategoryId,
  systemSuppliers: CatalogSupplier[],
): CatalogSupplier[] {
  const inCat = systemSuppliers.filter((s) => s.categories.includes(category));
  const seen = new Set(inCat.map((s) => s.name.toLowerCase()));
  const curated = CATALOG_SUPPLIERS.filter(
    (s) => s.categories.includes(category) && !seen.has(s.name.toLowerCase()),
  );
  return [...inCat, ...curated];
}
