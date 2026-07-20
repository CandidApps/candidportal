import { SOLUTION_CATEGORIES, type SolutionCategoryId } from '@/lib/solutions/catalog';
import { resolveSupplierLogo, supplierFaviconUrl } from '@/lib/supplier-logos';

export type MarketplaceVendor = {
  name: string;
  domain: string;
  category: SolutionCategoryId;
  negotiations: number;
  saveUpTo: number;
  blurb: string;
  recentSave?: { amount: number; pct: number };
};

export const MARKETPLACE_BESTSELLERS: MarketplaceVendor[] = [
  {
    name: 'Dialpad',
    domain: 'dialpad.com',
    category: 'ucaas',
    negotiations: 892,
    saveUpTo: 28,
    blurb: 'AI-powered UCaaS with call recaps, SMS, and contact center in one platform.',
    recentSave: { amount: 12400, pct: 22 },
  },
  {
    name: 'RingCentral',
    domain: 'ringcentral.com',
    category: 'ucaas',
    negotiations: 1786,
    saveUpTo: 25,
    blurb: 'Cloud phone, video, SMS, and fax — integrated CRM and global coverage.',
    recentSave: { amount: 8600, pct: 18 },
  },
  {
    name: 'Comcast Business',
    domain: 'comcast.com',
    category: 'connectivity',
    negotiations: 1244,
    saveUpTo: 32,
    blurb: 'Fiber, broadband, and business voice with wide metro footprint.',
    recentSave: { amount: 18200, pct: 19 },
  },
  {
    name: 'Microsoft 365',
    domain: 'microsoft.com',
    category: 'cloud',
    negotiations: 722,
    saveUpTo: 24,
    blurb: 'Productivity suite, Teams, and cloud identity for every seat.',
    recentSave: { amount: 9400, pct: 15 },
  },
  {
    name: 'Datadog',
    domain: 'datadoghq.com',
    category: 'cloud',
    negotiations: 699,
    saveUpTo: 28,
    blurb: 'Monitoring, security, and observability across your full stack.',
    recentSave: { amount: 48000, pct: 21 },
  },
  {
    name: 'Okta',
    domain: 'okta.com',
    category: 'security',
    negotiations: 1001,
    saveUpTo: 26,
    blurb: 'Identity, SSO, and lifecycle management for cloud and on-prem apps.',
    recentSave: { amount: 12277, pct: 7.4 },
  },
  {
    name: 'Zoom',
    domain: 'zoom.us',
    category: 'ucaas',
    negotiations: 1124,
    saveUpTo: 22,
    blurb: 'Meetings, phone, chat, and contact center with a large app ecosystem.',
    recentSave: { amount: 6200, pct: 14 },
  },
  {
    name: 'Salesforce',
    domain: 'salesforce.com',
    category: 'cloud',
    negotiations: 1786,
    saveUpTo: 25,
    blurb: 'CRM platform unifying sales, service, marketing, and commerce.',
    recentSave: { amount: 42800, pct: 18 },
  },
];

export const MARKETPLACE_TOP_SAVINGS: MarketplaceVendor[] = [
  {
    name: 'Lumen',
    domain: 'lumen.com',
    category: 'connectivity',
    negotiations: 640,
    saveUpTo: 34,
    blurb: 'Dedicated internet, WAN, and edge services on a global fiber network.',
  },
  {
    name: 'Five9',
    domain: 'five9.com',
    category: 'contact_center',
    negotiations: 510,
    saveUpTo: 31,
    blurb: 'Cloud contact center with AI, IVR, and omnichannel routing.',
  },
  {
    name: 'CrowdStrike',
    domain: 'crowdstrike.com',
    category: 'security',
    negotiations: 338,
    saveUpTo: 30,
    blurb: 'Cloud-native endpoint protection and threat intelligence.',
  },
  {
    name: 'Fortinet',
    domain: 'fortinet.com',
    category: 'sdwan',
    negotiations: 420,
    saveUpTo: 29,
    blurb: 'Secure SD-WAN, firewall, and unified SASE platform.',
  },
  {
    name: 'Worldpay / FIS',
    domain: 'worldpay.com',
    category: 'payments',
    negotiations: 880,
    saveUpTo: 41,
    blurb: 'Card processing, POS, and merchant services at scale.',
  },
  {
    name: 'AT&T Business',
    domain: 'att.com',
    category: 'connectivity',
    negotiations: 910,
    saveUpTo: 27,
    blurb: 'Fiber, wireless, and managed networking nationwide.',
  },
];

export const LIVE_SAVINGS_FEED = [
  { vendor: 'dbt Cloud', amount: 18000, pct: 9.3 },
  { vendor: 'Okta', amount: 12277, pct: 7.4 },
  { vendor: 'Datadog', amount: 48000, pct: 21 },
  { vendor: 'Comcast Business', amount: 18200, pct: 19 },
  { vendor: 'Dialpad', amount: 12400, pct: 22 },
  { vendor: 'Microsoft 365', amount: 9400, pct: 15 },
  { vendor: 'Salesforce', amount: 42800, pct: 18 },
  { vendor: 'Spectrum Business', amount: 8600, pct: 16 },
];

export function vendorFavicon(domain: string) {
  return supplierFaviconUrl(domain, 64);
}

export function vendorInitials(name: string) {
  return resolveSupplierLogo(name).initials;
}

export { SOLUTION_CATEGORIES };
