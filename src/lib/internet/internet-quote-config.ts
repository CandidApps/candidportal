/** Internet quote connection types (admin + member). Trimmed to routable options. */

export const INTERNET_CONNECTION_TYPE_OPTIONS = [
  { id: 'broadband', label: 'Broadband' },
  { id: 'coax_cable', label: 'Coax Cable' },
  { id: 'fiber', label: 'Fiber' },
  { id: 'cellular', label: 'Cellular (Verizon, T-Mobile, For2Fi)' },
  { id: 'satellite', label: 'Satellite (Starlink)' },
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
/** Canonical subject prefix; live emails may use -, –, or —. */
export const SCOUT_LOOKUP_SUBJECT_PREFIX = 'SCOUT Lookup - ';

export const SATELLITE_REQUEST_TO = 'partners@telarus.com';
export const SATELLITE_REQUEST_CC = 'krusch@telarus.com';

export type InternetRoutingChannel = 'scout' | 'cellular_rates' | 'satellite_email';

export function internetRoutingForConnectionTypes(
  types: string[],
): InternetRoutingChannel {
  if (types.includes('satellite')) return 'satellite_email';
  if (types.includes('cellular')) return 'cellular_rates';
  return 'scout';
}

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
