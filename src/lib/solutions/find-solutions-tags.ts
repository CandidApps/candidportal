/** Shared Find Solutions tag vocab — admins can also add custom values. */

export const FIND_SOLUTIONS_CAPABILITY_SUGGESTIONS = [
  'MS Teams',
  'SIP Trunks',
  'Intl PSTN',
  'Intl Orig',
  'On-Prem',
  'Call Center',
  'Chat',
  'SMS',
  'Call Flip',
  'Key System',
  'AI / Conversation intelligence',
  'Omnichannel',
  'Video meetings',
  'CRM integrations',
  'HIPAA',
  'SOC2',
  'PCI-DSS',
] as const;

export const FIND_SOLUTIONS_SERVICE_SUGGESTIONS = [
  'SIP Trunks',
  'Collab/Conf',
  'Contact Center',
  'UC/Hosted Voice',
  'Toll Free',
  'CPaaS',
  'SMS',
  'SBC/DR',
  'IVR',
  'CX Analytics',
  'Conv. AI',
  'Doc/Fax',
  'DIA',
  'SD-WAN',
  'MPLS',
  'DR',
  'Pub Cloud',
  'Colo',
  '5G',
  'MDM',
  'Payments',
  'Managed Security',
  'IoT',
] as const;

export function normalizeTagList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const tag = String(item ?? '').trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}
