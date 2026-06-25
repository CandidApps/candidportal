export const MEMBER_EMAIL_NOTIFICATION_KEYS = [
  'ticket_responses',
  'analysis_complete',
  'rate_increases',
  'contract_renewals',
  'services_expiring',
  'service_added',
  'statement_reviewed',
  'savings_opportunities',
] as const;

export type MemberEmailNotificationKey = (typeof MEMBER_EMAIL_NOTIFICATION_KEYS)[number];

export type MemberNotificationPreferences = Record<MemberEmailNotificationKey, boolean>;

export const MEMBER_EMAIL_NOTIFICATION_LABELS: Record<
  MemberEmailNotificationKey,
  { label: string; description: string }
> = {
  ticket_responses: {
    label: 'Ticket responses',
    description: 'When the Candid team replies to a support ticket you opened',
  },
  analysis_complete: {
    label: 'Analysis complete',
    description: 'When your savings analysis or quote is ready to review',
  },
  rate_increases: {
    label: 'Rate increases',
    description: 'When we detect or are notified of a rate increase on your account',
  },
  contract_renewals: {
    label: 'Contract renewals',
    description: 'Upcoming contract renewal dates and renewal windows',
  },
  services_expiring: {
    label: 'Services expiring',
    description: 'When a tracked service contract is approaching expiration',
  },
  service_added: {
    label: 'Service added',
    description: 'When a new service is added to your account',
  },
  statement_reviewed: {
    label: 'Statement reviewed',
    description: 'When Candid finishes reviewing a statement you submitted',
  },
  savings_opportunities: {
    label: 'Savings opportunities',
    description: 'New savings opportunities identified for your business',
  },
};

export function defaultMemberNotificationPreferences(): MemberNotificationPreferences {
  return {
    ticket_responses: true,
    analysis_complete: true,
    rate_increases: true,
    contract_renewals: true,
    services_expiring: true,
    service_added: true,
    statement_reviewed: true,
    savings_opportunities: true,
  };
}

export function mergeNotificationPreferences(
  raw: Record<string, unknown> | null | undefined,
): MemberNotificationPreferences {
  const defaults = defaultMemberNotificationPreferences();
  if (!raw || typeof raw !== 'object') return defaults;
  const out = { ...defaults };
  for (const key of MEMBER_EMAIL_NOTIFICATION_KEYS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  return out;
}
