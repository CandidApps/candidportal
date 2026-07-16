export const OUTREACH_STATUSES = [
  'not_started',
  'attempted_contact',
  'connected',
  'follow_up_needed',
  'information_sent',
  'waiting_on_customer',
  'opportunity_identified',
  'completed',
  'do_not_contact',
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_STATUS_LABELS: Record<OutreachStatus, string> = {
  not_started: 'Not Started',
  attempted_contact: 'Attempted Contact',
  connected: 'Connected',
  follow_up_needed: 'Follow-Up Needed',
  information_sent: 'Information Sent',
  waiting_on_customer: 'Waiting on Customer',
  opportunity_identified: 'Opportunity Identified',
  completed: 'Completed',
  do_not_contact: 'Do Not Contact',
};

export const OUTREACH_HELP_OPTIONS = [
  'payment_processing',
  'internet',
  'phones_ucaas',
  'microsoft_licensing',
  'cybersecurity',
  'managed_it',
  'website_services',
  'software_development',
  'other',
  'no_current_need',
] as const;

export type OutreachHelpOption = (typeof OUTREACH_HELP_OPTIONS)[number];

export const OUTREACH_HELP_LABELS: Record<OutreachHelpOption, string> = {
  payment_processing: 'Payment Processing',
  internet: 'Internet',
  phones_ucaas: 'Phones / UCaaS',
  microsoft_licensing: 'Microsoft Licensing',
  cybersecurity: 'Cybersecurity',
  managed_it: 'Managed IT',
  website_services: 'Website Services',
  software_development: 'Software Development',
  other: 'Other',
  no_current_need: 'No Current Need',
};

export const OUTREACH_ASSIGN_PRESETS = [
  'me',
  'joe',
  'bryan',
  'joe_bryan',
  'other',
] as const;

export type OutreachAssignPreset = (typeof OUTREACH_ASSIGN_PRESETS)[number];

export const OUTREACH_ASSIGN_LABELS: Record<OutreachAssignPreset, string> = {
  me: 'Me (current user)',
  joe: 'Joe',
  bryan: 'Bryan',
  joe_bryan: 'Joe and Bryan',
  other: 'Another user…',
};

export const OUTREACH_COLUMN_IDS = [
  'account',
  'contact',
  'owner',
  'status',
  'daysSince',
  'lastContacted',
  'nextFollowUp',
  'followUpOwner',
  'assignTo',
  'howCanWeHelp',
  'currentProvider',
  'painPoints',
  'notes',
  'actions',
] as const;

export type OutreachColumnId = (typeof OUTREACH_COLUMN_IDS)[number];

export const OUTREACH_COLUMN_LABELS: Record<OutreachColumnId, string> = {
  account: 'Account',
  contact: 'Contact',
  owner: 'List owner',
  status: 'Status',
  daysSince: 'Days since contact',
  lastContacted: 'Last Contacted',
  nextFollowUp: 'Next Follow-Up',
  followUpOwner: 'Outreach Owner',
  assignTo: 'Assign To',
  howCanWeHelp: 'How Can We Help?',
  currentProvider: 'Current Provider',
  painPoints: 'Customer Pain Points',
  notes: 'Notes',
  actions: 'Actions',
};

/** Compact summary columns for the main table. Longer fields live in the side panel. */
export const DEFAULT_OUTREACH_VISIBLE_COLUMNS: OutreachColumnId[] = [
  'account',
  'contact',
  'status',
  'daysSince',
  'nextFollowUp',
  'followUpOwner',
  'actions',
];

export type OutreachContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
};

export type OutreachAccount = {
  id: string;
  ownerUserId: string;
  ownerEmail?: string;
  ownerDisplayName?: string;
  customerExternalId: string;
  company: string;
  contactId: string | null;
  contact?: OutreachContact | null;
  contacts: OutreachContact[];
  status: OutreachStatus;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  followUpOwnerUserId: string | null;
  followUpOwnerDisplayName?: string;
  howCanWeHelp: OutreachHelpOption;
  howElseHelp: string;
  currentProvider: string;
  painPoints: string;
  notes: string;
  assignedUserIds: string[];
  assignedDisplayNames?: string[];
  linkedReminderId: string | null;
  linkedLeadId: string | null;
  knowsCandid: boolean | null;
  knowsWhatWeDo: boolean | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type OutreachOwnerOption = {
  id: string;
  email: string;
  displayName: string;
};

export type OutreachColumnPrefs = {
  visibleColumns: OutreachColumnId[];
  columnOrder: OutreachColumnId[];
};

export type OutreachPatch = Partial<{
  status: OutreachStatus;
  contactId: string | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  followUpOwnerUserId: string | null;
  howCanWeHelp: OutreachHelpOption;
  howElseHelp: string;
  currentProvider: string;
  painPoints: string;
  notes: string;
  assignedUserIds: string[];
  assignPreset: OutreachAssignPreset;
  otherUserId: string;
  knowsCandid: boolean | null;
  knowsWhatWeDo: boolean | null;
  sortOrder: number;
  logActivity: boolean;
  activityNote: string;
}>;

function isOutreachStatus(value: string): value is OutreachStatus {
  return (OUTREACH_STATUSES as readonly string[]).includes(value);
}

function isHelpOption(value: string): value is OutreachHelpOption {
  return (OUTREACH_HELP_OPTIONS as readonly string[]).includes(value);
}

function isColumnId(value: string): value is OutreachColumnId {
  return (OUTREACH_COLUMN_IDS as readonly string[]).includes(value);
}

export function normalizeOutreachStatus(value: unknown): OutreachStatus {
  if (typeof value !== 'string') return 'not_started';
  const legacy: Record<string, OutreachStatus> = {
    not_contacted: 'not_started',
    contacted: 'connected',
    no_response: 'attempted_contact',
    interested: 'opportunity_identified',
    closed: 'completed',
  };
  if (legacy[value]) return legacy[value]!;
  if (isOutreachStatus(value)) return value;
  return 'not_started';
}

export function normalizeOutreachHelp(value: unknown): OutreachHelpOption {
  if (typeof value === 'string' && isHelpOption(value)) return value;
  return 'no_current_need';
}

export function normalizeColumnPrefs(input?: {
  visibleColumns?: unknown;
  columnOrder?: unknown;
} | null): OutreachColumnPrefs {
  const orderRaw = Array.isArray(input?.columnOrder) ? input!.columnOrder : [];
  const visibleRaw = Array.isArray(input?.visibleColumns) ? input!.visibleColumns : [];
  const order = orderRaw.filter((c): c is OutreachColumnId => typeof c === 'string' && isColumnId(c));
  const visible = visibleRaw.filter((c): c is OutreachColumnId => typeof c === 'string' && isColumnId(c));
  const columnOrder =
    order.length > 0
      ? [...order, ...OUTREACH_COLUMN_IDS.filter((c) => !order.includes(c))]
      : [...OUTREACH_COLUMN_IDS];
  const visibleColumns =
    visible.length > 0 ? visible.filter((c) => c !== 'account') : [...DEFAULT_OUTREACH_VISIBLE_COLUMNS];
  if (!visibleColumns.includes('account')) visibleColumns.unshift('account');
  if (!visibleColumns.includes('actions')) visibleColumns.push('actions');
  return { visibleColumns, columnOrder };
}

export async function listOutreachAccounts(owner: 'me' | 'all' | string = 'me'): Promise<{
  items: OutreachAccount[];
  owners: OutreachOwnerOption[];
  currentUserId: string | null;
  columnPrefs: OutreachColumnPrefs;
}> {
  const params = new URLSearchParams({ owner });
  const res = await fetch(`/api/admin/outreach?${params.toString()}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to load outreach');
  }
  const data = (await res.json()) as {
    items: OutreachAccount[];
    owners: OutreachOwnerOption[];
    currentUserId: string | null;
    columnPrefs?: OutreachColumnPrefs;
  };
  return {
    ...data,
    columnPrefs: normalizeColumnPrefs(data.columnPrefs),
  };
}

export async function addOutreachAccounts(customerExternalIds: string[]): Promise<OutreachAccount[]> {
  const res = await fetch('/api/admin/outreach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerExternalIds }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to add accounts');
  }
  const data = (await res.json()) as { items?: OutreachAccount[] };
  return data.items ?? [];
}

export async function patchOutreachAccount(id: string, patch: OutreachPatch): Promise<OutreachAccount> {
  const res = await fetch('/api/admin/outreach', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to update');
  }
  const data = (await res.json()) as { item?: OutreachAccount };
  if (!data.item) throw new Error('Update failed');
  return data.item;
}

export async function deleteOutreachAccount(id: string): Promise<void> {
  const params = new URLSearchParams({ id });
  const res = await fetch(`/api/admin/outreach?${params.toString()}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to remove');
  }
}

export async function saveOutreachColumnPrefs(prefs: OutreachColumnPrefs): Promise<OutreachColumnPrefs> {
  const res = await fetch('/api/admin/outreach/column-prefs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to save column preferences');
  }
  const data = (await res.json()) as { prefs?: OutreachColumnPrefs };
  return normalizeColumnPrefs(data.prefs);
}

export async function createOutreachFollowUp(
  id: string,
  kind: 'action' | 'lead',
): Promise<{ reminderId?: string; leadId?: string; item: OutreachAccount }> {
  const res = await fetch('/api/admin/outreach/follow-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, kind }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to create follow-up');
  }
  return (await res.json()) as { reminderId?: string; leadId?: string; item: OutreachAccount };
}

export async function logOutreachContactActivity(
  id: string,
  channel: 'call' | 'email',
  resultNote?: string,
  currentStatus?: OutreachStatus,
): Promise<OutreachAccount> {
  const patch: OutreachPatch = {
    lastContactedAt: new Date().toISOString().slice(0, 10),
    logActivity: true,
    activityNote:
      resultNote?.trim() ||
      (channel === 'call' ? 'Logged phone outreach attempt.' : 'Logged email outreach attempt.'),
  };
  // Do not downgrade a more advanced outreach status.
  if (!currentStatus || currentStatus === 'not_started') {
    patch.status = 'attempted_contact';
  }
  return patchOutreachAccount(id, patch);
}
