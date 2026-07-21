/** Internet quote requirement options (admin + member). */

export const INTERNET_CONNECTION_TYPE_OPTIONS = [
  { id: 'business_dsl', label: 'Business DSL' },
  { id: 'fixed_wireless', label: 'Fixed Wireless Broadband' },
  { id: 'bonded_internet', label: 'Bonded Internet (3MB to 12MB)' },
  { id: 'business_cable', label: 'Business Cable' },
  { id: 'ethernet_copper', label: 'Ethernet (Copper)' },
  { id: 'satellite', label: 'Satellite High-Speed Internet' },
  { id: 'ethernet_fiber', label: 'Ethernet (Fiber)' },
] as const;

export type InternetConnectionTypeId = (typeof INTERNET_CONNECTION_TYPE_OPTIONS)[number]['id'];

export const INTERNET_ADDITIONAL_NEEDS_OPTIONS = [
  { id: '5g_backup', label: '5G Backup' },
  { id: 'sdwan_failover', label: 'SD-WAN/Failover' },
  { id: 'hardware', label: 'Hardware' },
] as const;

export type InternetAdditionalNeedId = (typeof INTERNET_ADDITIONAL_NEEDS_OPTIONS)[number]['id'];

export const SCOUT_REQUEST_TO = 'scout@sandlerpartners.com';
export const SCOUT_REQUEST_CC = 'quotes@candid.solutions';
export const SCOUT_RESPONSE_FROM = 'mnorman@sandlerpartners.com';
export const SCOUT_LOOKUP_SUBJECT_PREFIX = 'SCOUT Lookup - ';

export function internetConnectionTypeLabel(id: string): string {
  return INTERNET_CONNECTION_TYPE_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export function formatServiceAddress(parts: {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}): string {
  const line1 = parts.street?.trim();
  const cityStateZip = [parts.city?.trim(), parts.state?.trim(), parts.zip?.trim()]
    .filter(Boolean)
    .join(', ')
    .replace(/,\s*,/g, ',');
  if (line1 && cityStateZip) return `${line1}, ${cityStateZip}`;
  return line1 || cityStateZip || '';
}

export function scoutPortalContractUrl(serviceAddress: string): string {
  const q = encodeURIComponent(serviceAddress.trim());
  return `https://www.sandlerportal.com/scout?address=${q}`;
}
