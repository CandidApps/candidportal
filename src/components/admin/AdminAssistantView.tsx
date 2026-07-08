'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import type { TeamMember } from '@/lib/admin-action-work';
import {
  fetchActionWorkMap,
  fetchTeamMembers,
  fetchTeamNotes,
  postTeamNote,
  updateActionWork,
  type TeamNoteRecord,
} from '@/lib/team-notes';
import type { ActionWorkState } from '@/lib/admin-action-work';
import type { Customer } from '@/components/CustomersView';
import { findCustomerByContactEmail } from '@/lib/crm/customer-lookup';
import { fetchContactDetail, type ContactDetail } from '@/lib/crm/contact-detail';
import {
  fetchCustomerConversation,
  fetchMessageContent,
  type ConversationMessage,
} from '@/lib/email/client';
import { MyAssistantHankPanel } from '@/components/admin/MyAssistantHankPanel';
import {
  AssistantTasksPanel,
  type AddTaskOptions,
} from '@/components/admin/AssistantTasksPanel';
import { AddTaskModal } from '@/components/admin/AddTaskModal';
import { useCrmData } from '@/components/CrmDataProvider';
import { getBmwAgentRates } from '@/lib/bmw/deal-master';
import { shouldAutoPrioritizeEmail } from '@/lib/assistant/email-auto-priority';
import {
  sourceMetaFromAction,
  sourceMetaFromCall,
  sourceMetaFromRecap,
  sourceMetaFromTriagedEmail,
} from '@/lib/assistant/task-source';
import { stripDialpadRecapLinkText } from '@/lib/email/dialpad-recap-link';
import { RichTextField } from '@/components/admin/RichTextField';
import {
  fetchMeetingSettings,
  hasMeetingSettings,
  MEETING_ATTACHMENT_UPLOAD_URL,
  type MeetingSettings,
} from '@/lib/assistant/meeting-settings';
import {
  fetchMentionInbox,
  markMentionsRead,
  postMessage,
  type MentionInboxItem,
} from '@/lib/message-center';
import {
  createAssistantTask,
  createCalendarEvent,
  deleteAssistantTask,
  deleteCalendarEvent,
  fetchCalendarEvent,
  fetchAssistantBrief,
  fetchAssistantOverview,
  fetchAssistantTasks,
  fetchCalendarWeek,
  fetchFreeBusy,
  fetchReplyDraft,
  fetchPortalContactDirectory,
  searchPortalContacts,
  sendEmailReply,
  syncDialpadCalls,
  fetchDialpadDiagnostics,
  type DialpadDiagnostics,
  updateAssistantTask,
  updateCalendarEvent,
  type AssistantAction,
  type AssistantActionKind,
  type AssistantCall,
  type AssistantEventAttendee,
  type PortalContact,
  type AssistantBriefResult,
  type AssistantCalendarEvent,
  type AssistantEmailItem,
  type AssistantOverview,
  type AssistantRecap,
  type AssistantRef,
  type AssistantTask,
  type AssistantTaskPriority,
  type CalendarEventInput,
  type TriagedEmail,
} from '@/lib/assistant/types';
import { parseScheduleRequest, findCommonSlot, type RosterEntry } from '@/lib/assistant/schedule';
import {
  loadManualPriorityEmails,
  saveManualPriorityEmails,
  triagedFromInbox,
  type ManualPriorityEmail,
} from '@/lib/assistant/email-priority';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PRIORITY_LABEL: Record<AssistantTaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

const TAG_LABEL: Record<TriagedEmail['tag'], string> = {
  urgent: 'Urgent',
  partner: 'Partner',
  customer: 'Customer',
  renewal: 'Renewal',
};

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function fmtClock(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function briefGeneratedLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const stale = Date.now() - t > 15 * 60 * 1000;
  const when = relativeTime(iso);
  return stale ? `Cached from ${when}` : `Updated ${when}`;
}

function fmtDue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Human label for when an item was first mentioned/seen. */
function fmtSince(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function emailAddr(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

const ACTION_ICON: Record<string, AppIconName> = {
  ticket: 'messages',
  review_request: 'sparkles',
  quote_request: 'reports',
  analysis_review: 'chart',
  reminder: 'alerts',
};

const ACTION_KIND_LABEL: Record<AssistantActionKind, string> = {
  ticket: 'Service tickets',
  review_request: 'Review requests',
  quote_request: 'Quote requests',
  analysis_review: 'Analysis reviews',
  reminder: 'Reminders',
};

const ACTION_TYPE_FILTERS: { id: AssistantActionKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ticket', label: ACTION_KIND_LABEL.ticket },
  { id: 'quote_request', label: ACTION_KIND_LABEL.quote_request },
  { id: 'review_request', label: ACTION_KIND_LABEL.review_request },
  { id: 'analysis_review', label: ACTION_KIND_LABEL.analysis_review },
  { id: 'reminder', label: ACTION_KIND_LABEL.reminder },
];

/** Modal target for the AI reply / compose composer. */
type ComposeTarget = {
  to: string;
  /** Pre-filled Cc recipients (e.g. the other people on a reply-all). */
  cc?: string;
  subject: string;
  lookupEmail: string;
  emailId?: string;
  messageId?: string;
  folderId?: string;
  contextLabel?: string;
  mode?: 'reply' | 'new';
};

type AllMailFilters = {
  subject: string;
  contact: string;
  account: string;
  vendor: string;
};

type InboxEmailMeta = {
  contactName: string;
  contactEmail: string;
  account: string | null;
  vendor: string | null;
};

function plainFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function draftPlainToHtml(text: string): string {
  if (!text.trim()) return '';
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function inboxEmailMeta(
  item: AssistantEmailItem,
  directory: Map<string, PortalContact>,
  customers: Customer[],
): InboxEmailMeta {
  const contactEmail = (item.fromAddress || emailAddr(item.from)).toLowerCase();
  const contactName =
    item.from.replace(/<[^>]+>/g, '').trim() || directory.get(contactEmail)?.name || contactEmail;
  const dir = directory.get(contactEmail);
  if (dir?.type === 'supplier') {
    return { contactName: dir.name, contactEmail, account: null, vendor: dir.org };
  }
  if (dir?.type === 'account') {
    return { contactName: dir.name, contactEmail, account: dir.org, vendor: null };
  }
  const customer = findCustomerByContactEmail(customers, contactEmail);
  if (customer) {
    const ct =
      customer.contacts.find((x) => x.email.trim().toLowerCase() === contactEmail) ??
      customer.contacts[0];
    return {
      contactName: ct?.name ?? contactName,
      contactEmail,
      account: customer.company,
      vendor: null,
    };
  }
  return { contactName, contactEmail, account: null, vendor: null };
}

/** Splits a raw "a@x.com, Name <b@y.com>" string into bare email addresses. */
function splitEmails(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((p) => emailAddr(p.trim()))
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

/** A contextual call-to-action shown on a brief item. */
type BriefAction = {
  label: string;
  icon: AppIconName;
  onClick: () => void;
  primary?: boolean;
};

/** A brief line item (priority / missed / recommendation) the UI can action. */
type BriefItemLike = {
  title: string;
  why: string;
  ref?: AssistantRef | null;
  intent?: import('@/lib/assistant/types').AssistantIntent | null;
};

/** A unit of work the user finished today (zero-inbox). */
type CompletedItem = {
  key: string;
  type: 'email' | 'action' | 'priority' | 'task' | 'recap';
  title: string;
  subtitle?: string;
  completedAt: string;
};

const SECTIONS: { id: string; label: string; mobileLabel: string; icon: AppIconName }[] = [
  { id: 'asec-brief', label: 'Your brief', mobileLabel: 'Brief', icon: 'sparkles' },
  { id: 'asec-calendar', label: 'Calendar', mobileLabel: 'Calendar', icon: 'calendar' },
  { id: 'asec-email', label: 'Email to handle', mobileLabel: 'Email', icon: 'email' },
  { id: 'asec-actions', label: 'Portal actions & tickets', mobileLabel: 'Actions', icon: 'alerts' },
  { id: 'asec-tasks', label: 'Priorities & tasks', mobileLabel: 'Tasks', icon: 'check' },
  { id: 'asec-comms', label: 'Communications', mobileLabel: 'UcaaS', icon: 'phone' },
  { id: 'asec-mentions', label: 'My mentions', mobileLabel: 'Mentions', icon: 'specialist' },
  { id: 'asec-completed', label: 'Completed today', mobileLabel: 'Completed', icon: 'check' },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function SectionJumpButtons({
  sectionCounts,
  onJump,
  mobile,
}: {
  sectionCounts: Record<string, number>;
  onJump: (id: string) => void;
  mobile?: boolean;
}) {
  return (
    <>
      {SECTIONS.map((s) => {
        const count = sectionCounts[s.id] ?? 0;
        if (mobile) {
          const pillLabel = s.mobileLabel;
          return (
            <button
              key={s.id}
              type="button"
              className="assist-mobile-section-pill"
              onClick={() => onJump(s.id)}
              aria-label={count > 0 ? `${pillLabel} (${count})` : pillLabel}
            >
              <AppIcon name={s.icon} size={12} />
              <span className="assist-mobile-section-pill-label">{pillLabel}</span>
              {count > 0 && <span className="assist-seg-count">{count > 99 ? '99+' : count}</span>}
            </button>
          );
        }
        return (
          <button
            key={s.id}
            type="button"
            className="acct-section-rail-btn"
            onClick={() => onJump(s.id)}
            aria-label={count > 0 ? `${s.label} (${count})` : s.label}
          >
            <AppIcon name={s.icon} size={15} />
            {count > 0 && (
              <span className="acct-section-rail-count">{count > 99 ? '99+' : count}</span>
            )}
            <span className="acct-section-rail-tip">
              {s.label}
              {count > 0 ? ` · ${count}` : ''}
            </span>
          </button>
        );
      })}
    </>
  );
}

const completedStorageKey = () => `assist-completed-${new Date().toISOString().slice(0, 10)}`;

function loadCompleted(): CompletedItem[] {
  if (typeof window === 'undefined') return [];
  try {
    // Drop any prior days' buckets so the list always reflects "today".
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('assist-completed-') && k !== completedStorageKey()) {
        window.localStorage.removeItem(k);
      }
    }
    const raw = window.localStorage.getItem(completedStorageKey());
    return raw ? (JSON.parse(raw) as CompletedItem[]) : [];
  } catch {
    return [];
  }
}

export default function AdminAssistantView({
  currentUserId,
  currentUserName,
  onOpenAction,
  customers = [],
  onOpenCustomer,
  onOpenMessageCenter,
}: {
  currentUserId: string;
  currentUserName: string;
  onOpenAction?: (action: { kind: AssistantAction['kind']; sourceId: string }) => void;
  customers?: Customer[];
  onOpenCustomer?: (customerId: string) => void;
  onOpenMessageCenter?: () => void;
}) {
  const [overview, setOverview] = useState<AssistantOverview | null>(null);
  const [brief, setBrief] = useState<AssistantBriefResult | null>(null);
  const [briefRefreshError, setBriefRefreshError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [newTaskPriority, setNewTaskPriority] = useState<AssistantTaskPriority>('normal');
  const [newTaskAssignees, setNewTaskAssignees] = useState<Set<string>>(() => new Set());
  const [taskDetailsFocusId, setTaskDetailsFocusId] = useState<string | null>(null);
  const [openActionThread, setOpenActionThread] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const [composeQueue, setComposeQueue] = useState<ComposeTarget[]>([]);
  const [actionWork, setActionWork] = useState<Record<string, ActionWorkState>>({});
  const [completed, setCompleted] = useState<CompletedItem[]>([]);
  const [viewEmail, setViewEmail] = useState<AssistantOverview['email']['inbox'][number] | null>(null);
  const [emailTab, setEmailTab] = useState<'priority' | 'all'>('priority');
  const [manualPriorityEmails, setManualPriorityEmails] = useState<ManualPriorityEmail[]>([]);
  const [allMailFilters, setAllMailFilters] = useState<AllMailFilters>({
    subject: '',
    contact: '',
    account: '',
    vendor: '',
  });
  const [contactDirectory, setContactDirectory] = useState<Map<string, PortalContact>>(new Map());
  const [mounted, setMounted] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<{ attendees: string; title: string } | null>(null);
  const [syncingCalls, setSyncingCalls] = useState(false);
  const [callsScope, setCallsScope] = useState<'mine' | 'team'>('mine');
  type CommsFilter = 'recent' | 'calls' | 'messages' | 'voicemails';
  const [commsFilter, setCommsFilter] = useState<CommsFilter>('recent');
  const [contactModal, setContactModal] = useState<{ email: string; name: string } | null>(null);
  const [dialpadDiag, setDialpadDiag] = useState<DialpadDiagnostics | null>(null);
  const [dialpadDiagLoading, setDialpadDiagLoading] = useState(false);
  const [mentionInbox, setMentionInbox] = useState<MentionInboxItem[]>([]);
  const [mentionFilter, setMentionFilter] = useState<'unread' | 'read'>('unread');
  const [mentionReplyFor, setMentionReplyFor] = useState<string | null>(null);
  const [mentionReplyDraft, setMentionReplyDraft] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState<AssistantActionKind | 'all'>('all');
  const [addTaskModal, setAddTaskModal] = useState<{ title: string; opts?: AddTaskOptions } | null>(
    null,
  );

  const { ready: crmReady, agentRates } = useCrmData();

  const first = currentUserName.split(/\s+/)[0] ?? 'there';

  useEffect(() => {
    setCompleted(loadCompleted());
    setManualPriorityEmails(loadManualPriorityEmails());
  }, []);

  useEffect(() => {
    saveManualPriorityEmails(manualPriorityEmails);
  }, [manualPriorityEmails]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(completedStorageKey(), JSON.stringify(completed));
    } catch {
      /* ignore */
    }
  }, [completed]);

  const completedKeys = useMemo(() => new Set(completed.map((c) => c.key)), [completed]);

  const markComplete = useCallback((item: CompletedItem) => {
    setCompleted((prev) =>
      prev.some((c) => c.key === item.key) ? prev : [{ ...item, completedAt: new Date().toISOString() }, ...prev],
    );
  }, []);

  const reopenCompleted = useCallback(
    (key: string) => {
      const item = completed.find((c) => c.key === key);
      setCompleted((prev) => prev.filter((c) => c.key !== key));
      if (item?.type === 'task') {
        const id = key.slice('task:'.length);
        void updateAssistantTask(id, { status: 'open' })
          .then((updated) => setTasks((prev) => prev.map((t) => (t.id === id ? updated : t))))
          .catch(() => undefined);
      }
    },
    [completed],
  );

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await fetchAssistantOverview({ callsScope }));
    } catch {
      setOverview(null);
    }
  }, [callsScope]);

  const openCommsPane = useCallback((filter: CommsFilter) => {
    setCommsFilter(filter);
    requestAnimationFrame(() => scrollToSection('asec-comms'));
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      // scope=team returns all tasks — split into mine vs team client-side.
      setTasks(await fetchAssistantTasks('team'));
    } catch {
      setTasks([]);
    }
  }, []);

  const resolveCustomerId = useCallback(
    (a: AssistantAction): string | null => {
      if (a.customerId && customers.some((c) => c.id === a.customerId)) return a.customerId;
      const byEmail = findCustomerByContactEmail(customers, a.customerEmail);
      if (byEmail) return byEmail.id;
      if (a.who) {
        const byName = customers.find(
          (c) => c.company.trim().toLowerCase() === a.who.trim().toLowerCase(),
        );
        if (byName) return byName.id;
      }
      return null;
    },
    [customers],
  );

  const loadActionWork = useCallback(async () => {
    try {
      setActionWork(await fetchActionWorkMap());
    } catch {
      /* ignore */
    }
  }, []);

  const loadMentionInbox = useCallback(async () => {
    try {
      setMentionInbox(await fetchMentionInbox());
    } catch {
      /* ignore */
    }
  }, []);

  const submitMentionReply = async (item: MentionInboxItem) => {
    const body = mentionReplyDraft.trim();
    if (!body) return;
    try {
      if (item.contextType === 'channel') {
        if (!item.contextKey) throw new Error('Channel not found');
        await postMessage({ channelId: item.contextKey, body });
      } else {
        await postTeamNote({
          contextType: item.contextType,
          contextKey: item.contextKey,
          body,
        });
      }
      await markMentionsRead([item.notificationId]);
      setMentionReplyDraft('');
      setMentionReplyFor(null);
      await Promise.all([loadMentionInbox(), loadOverview()]);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await Promise.all([loadOverview(), loadTasks(), loadActionWork(), loadMentionInbox()]);
      try {
        const m = await fetchTeamMembers();
        if (!cancelled) setMembers(m);
      } catch {
        /* ignore */
      }
      try {
        // Show DB-cached brief immediately. Regenerate only when empty or >60 min old
        // (server also enforces TTL so background POSTs don't burn Claude tokens).
        const cached = await fetchAssistantBrief(false);
        if (!cancelled) {
          setBrief(cached);
          setBriefRefreshError(null);
        }
        const generatedAt = cached?.brief?.generatedAt
          ? new Date(cached.brief.generatedAt).getTime()
          : 0;
        const missingPriorities =
          (cached?.brief?.missed?.length ?? 0) > 0 && (cached?.brief?.priorities?.length ?? 0) === 0;
        const stale =
          !generatedAt || Date.now() - generatedAt > 60 * 60 * 1000 || missingPriorities;
        if (stale) {
          try {
            const fresh = await fetchAssistantBrief(true);
            if (!cancelled) {
              setBrief(fresh);
              setBriefRefreshError(null);
            }
          } catch (e) {
            if (!cancelled) {
              setBriefRefreshError(e instanceof Error ? e.message : 'Failed to refresh brief');
            }
          }
        }
      } catch {
        /* ignore cached brief load failure */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadOverview, loadTasks, loadActionWork, loadMentionInbox]);

  // Poll overview often; Brief POST respects server 60-min TTL (no Claude if fresh).
  useEffect(() => {
    const interval = setInterval(
      () => {
        void loadOverview();
        void fetchAssistantBrief(true)
          .then((b) => {
            setBrief(b);
            setBriefRefreshError(null);
          })
          .catch((e) => {
            setBriefRefreshError(e instanceof Error ? e.message : 'Failed to refresh brief');
          });
      },
      30 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, [loadOverview]);

  const [briefBusy, setBriefBusy] = useState(false);
  const regenerateBrief = useCallback(async () => {
    setBriefBusy(true);
    setBriefRefreshError(null);
    try {
      setBrief(await fetchAssistantBrief(true, { force: true }));
    } catch (e) {
      setBriefRefreshError(e instanceof Error ? e.message : 'Failed to refresh brief');
    } finally {
      setBriefBusy(false);
    }
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadOverview(), loadTasks(), loadActionWork(), loadMentionInbox()]);
      await regenerateBrief();
    } finally {
      setRefreshing(false);
    }
  };

  const syncCalls = async () => {
    setSyncingCalls(true);
    try {
      const result = await syncDialpadCalls(30);
      await loadOverview();
      if (!result.configured) {
        window.alert('Dialpad isn’t connected — DIALPAD_API_KEY is missing on the server.');
      } else if (result.synced === 0) {
        window.alert(
          result.error
            ? `No calls synced. Dialpad said: ${result.error}`
            : 'No calls found in Dialpad for the last 30 days. Note: only completed calls appear, and the key needs the "calls:list" scope.',
        );
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to sync calls.');
    } finally {
      setSyncingCalls(false);
    }
  };

  const runDialpadDiag = async () => {
    setDialpadDiagLoading(true);
    try {
      setDialpadDiag(await fetchDialpadDiagnostics(7));
    } catch (e) {
      setDialpadDiag({ error: e instanceof Error ? e.message : 'Diagnostic failed' });
    } finally {
      setDialpadDiagLoading(false);
    }
  };

  const recapByEvent = useMemo(() => {
    const map = new Map<string, AssistantRecap>();
    for (const r of overview?.recaps ?? []) {
      if (r.matchedEventId) map.set(r.matchedEventId, r);
    }
    return map;
  }, [overview]);

  const unmatchedRecaps = useMemo(
    () => (overview?.recaps ?? []).filter((r) => !r.matchedEventId),
    [overview],
  );

  const allCalls = overview?.calls ?? [];
  const voicemailCalls = useMemo(() => allCalls.filter(isVoicemailCall), [allCalls]);
  const commFeedRecent = useMemo(() => {
    const items: CommFeedItem[] = [];
    for (const c of allCalls) {
      if (!c.startedAt) continue;
      items.push({ kind: 'call', id: `call:${c.id}`, at: new Date(c.startedAt).getTime(), call: c });
    }
    for (const r of overview?.recaps ?? []) {
      items.push({ kind: 'message', id: `recap:${r.id}`, at: r.receivedTime, recap: r });
    }
    items.sort((a, b) => b.at - a.at);
    return items.slice(0, 30);
  }, [allCalls, overview?.recaps]);

  const inboxById = useMemo(() => {
    const map = new Map<string, AssistantOverview['email']['inbox'][number]>();
    for (const m of overview?.email.inbox ?? []) map.set(m.id, m);
    return map;
  }, [overview]);

  const mailbox = useMemo(() => (overview?.email.mailbox ?? '').toLowerCase(), [overview]);

  const agentEmails = useMemo(() => {
    if (!crmReady) return new Set<string>();
    return new Set(
      getBmwAgentRates()
        .map((a) => a.email.trim().toLowerCase())
        .filter(Boolean),
    );
  }, [crmReady, agentRates]);

  useEffect(() => {
    if (!overview?.email.connected) return;
    void fetchPortalContactDirectory().then((rows) => {
      const map = new Map<string, PortalContact>();
      for (const c of rows) map.set(c.email.toLowerCase(), c);
      setContactDirectory(map);
    });
  }, [overview?.email.connected]);

  const allMailFiltered = useMemo(() => {
    const inbox = overview?.email.inbox ?? [];
    const f = allMailFilters;
    return inbox.filter((m) => {
      const meta = inboxEmailMeta(m, contactDirectory, customers);
      if (f.subject && !m.subject.toLowerCase().includes(f.subject.toLowerCase())) return false;
      if (
        f.contact &&
        !`${meta.contactName} ${meta.contactEmail}`.toLowerCase().includes(f.contact.toLowerCase())
      ) {
        return false;
      }
      if (f.account && !(meta.account ?? '').toLowerCase().includes(f.account.toLowerCase())) return false;
      if (f.vendor && !(meta.vendor ?? '').toLowerCase().includes(f.vendor.toLowerCase())) return false;
      return true;
    });
  }, [overview?.email.inbox, allMailFilters, contactDirectory, customers]);

  const targetForInbox = useCallback(
    (item: AssistantOverview['email']['inbox'][number], label?: string): ComposeTarget => {
      const sender = item.fromAddress || emailAddr(item.from);
      const senderLc = sender.toLowerCase();
      // Reply-all candidates: everyone on the original To + Cc, minus us and the sender.
      const others = [...splitEmails(item.to), ...splitEmails(item.cc)].filter((e) => {
        const lc = e.toLowerCase();
        return lc !== senderLc && lc !== mailbox;
      });
      const cc = Array.from(new Set(others)).join(', ');
      return {
        to: sender,
        cc,
        subject: /^re:/i.test(item.subject) ? item.subject : `Re: ${item.subject}`,
        lookupEmail: sender,
        emailId: item.id,
        messageId: item.id,
        folderId: item.folderId,
        contextLabel: label ?? item.subject,
        mode: 'reply',
      };
    },
    [mailbox],
  );

  const openReplyForInbox = useCallback(
    (item: AssistantOverview['email']['inbox'][number], label?: string) => {
      setComposeQueue([]);
      setCompose(targetForInbox(item, label));
    },
    [targetForInbox],
  );

  // Build a reply target from a triaged email. Prefers the live inbox item (has
  // reply-all Cc + folder), but falls back to the data carried on the triaged
  // row so the reply button still works after the message rolls out of the
  // 50-message inbox window.
  const targetForTriaged = useCallback(
    (t: TriagedEmail, label?: string): ComposeTarget | null => {
      const item = inboxById.get(t.id);
      if (item) return targetForInbox(item, label);
      const sender = (t.fromAddress?.trim() || emailAddr(t.contact)).toLowerCase();
      if (!sender.includes('@')) return null;
      return {
        to: sender,
        subject: /^re:/i.test(t.subject) ? t.subject : `Re: ${t.subject || t.title}`,
        lookupEmail: sender,
        emailId: t.id,
        messageId: t.id,
        folderId: t.folderId,
        contextLabel: label ?? t.subject ?? t.title,
        mode: 'reply',
      };
    },
    [inboxById, targetForInbox],
  );

  const openReplyForTriaged = useCallback(
    (t: TriagedEmail, label?: string) => {
      const target = targetForTriaged(t, label);
      if (!target) return;
      setComposeQueue([]);
      setCompose(target);
    },
    [targetForTriaged],
  );

  const manualPriorityIdSet = useMemo(
    () => new Set(manualPriorityEmails.map((m) => m.id)),
    [manualPriorityEmails],
  );

  const addToPriority = useCallback(
    (item: AssistantOverview['email']['inbox'][number]) => {
      const meta = inboxEmailMeta(item, contactDirectory, customers);
      const triaged = triagedFromInbox(item, meta);
      setManualPriorityEmails((prev) => {
        if (prev.some((p) => p.id === item.id)) return prev;
        return [...prev, { ...triaged, manual: true, pinnedAt: new Date().toISOString() }];
      });
    },
    [contactDirectory, customers],
  );

  const removeFromPriority = useCallback((id: string) => {
    setManualPriorityEmails((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const draftAllReplies = useCallback(() => {
    const targets = (brief?.triagedEmails ?? [])
      .filter((t) => !completedKeys.has(`email:${t.id}`))
      .map((t) =>
        targetForTriaged(
          t,
          `${t.contact}${t.business && t.business !== 'Unknown' ? ` · ${t.business}` : ''}`,
        ),
      )
      .filter((t): t is ComposeTarget => Boolean(t));
    if (targets.length === 0) return;
    setComposeQueue(targets.slice(1));
    setCompose(targets[0]);
  }, [brief, completedKeys, targetForTriaged]);

  const handleComposeClose = useCallback(() => {
    if (composeQueue.length > 0) {
      setCompose(composeQueue[0]);
      setComposeQueue((q) => q.slice(1));
    } else {
      setCompose(null);
    }
  }, [composeQueue]);

  const openRef = useCallback(
    (ref: AssistantRef | null | undefined) => {
      if (!ref) return;
      if (ref.type === 'email') {
        const item = inboxById.get(ref.id);
        if (item) {
          openReplyForInbox(item);
          return;
        }
        scrollToSection('asec-email');
      } else if (ref.type === 'action') scrollToSection('asec-actions');
      else if (ref.type === 'mention') scrollToSection('asec-mentions');
      else if (ref.type === 'calendar') scrollToSection('asec-calendar');
      else if (ref.type === 'task') scrollToSection('asec-tasks');
      else if (ref.type === 'call') openCommsPane('calls');
      else if (ref.type === 'recap') openCommsPane('messages');
    },
    [inboxById, openReplyForInbox],
  );

  const actionById = useMemo(() => {
    const m = new Map<string, AssistantAction>();
    for (const a of overview?.actions ?? []) m.set(a.id, a);
    return m;
  }, [overview]);

  const callById = useMemo(() => {
    const m = new Map<string, AssistantCall>();
    for (const c of overview?.calls ?? []) m.set(c.id, c);
    return m;
  }, [overview]);

  const phoneForEmail = useCallback(
    (email?: string | null) => {
      const c = findCustomerByContactEmail(customers, email);
      if (!c) return '';
      const needle = (email ?? '').trim().toLowerCase();
      const ct =
        c.contacts.find((x) => x.email.trim().toLowerCase() === needle) ??
        c.contacts.find((x) => x.isPrimary) ??
        c.contacts[0];
      return ct?.phone?.trim() ?? '';
    },
    [customers],
  );

  const composeTo = useCallback((to: string, subject: string, label?: string) => {
    setComposeQueue([]);
    setCompose({
      to,
      subject,
      lookupEmail: to,
      contextLabel: label ?? subject,
      mode: 'new',
    });
  }, []);

  const openNewEmail = useCallback(() => {
    setComposeQueue([]);
    setCompose({
      to: '',
      subject: '',
      lookupEmail: '',
      contextLabel: 'New email',
      mode: 'new',
    });
  }, []);

  const openScheduleFor = useCallback((attendees: string, title: string) => {
    setScheduleTarget({ attendees, title });
  }, []);

  // Build the contextual call-to-actions for a brief item based on what it's
  // really asking the user to do (reply, schedule, call, open, …).
  const briefActionsFor = useCallback(
    (item: BriefItemLike): BriefAction[] => {
      const out: BriefAction[] = [];
      const ref = item.ref;
      const intent = item.intent;
      const text = `${item.title} ${item.why}`.toLowerCase();
      const wantsSchedule =
        intent === 'schedule' ||
        /\b(schedule|book|set ?up|calendar invite|invite them|meeting|demo|call with)\b/.test(text);
      const wantsCall = intent === 'call' || /\b(call them|give .* a call|phone)\b/.test(text);

      if (ref?.type === 'email') {
        const m = inboxById.get(ref.id);
        if (m) {
          const fromEmail = emailAddr(m.from);
          if (wantsSchedule) {
            out.push({ label: 'Schedule', icon: 'calendar', primary: true, onClick: () => openScheduleFor(fromEmail, m.subject) });
            out.push({ label: 'Reply', icon: 'email', onClick: () => openReplyForInbox(m) });
          } else if (wantsCall) {
            const ph = phoneForEmail(fromEmail);
            if (ph) out.push({ label: 'Call', icon: 'phone', primary: true, onClick: () => { window.location.href = `tel:${ph}`; } });
            out.push({ label: 'Reply', icon: 'email', primary: !ph, onClick: () => openReplyForInbox(m) });
          } else {
            out.push({ label: 'Reply', icon: 'email', primary: true, onClick: () => openReplyForInbox(m) });
          }
          out.push({ label: 'View', icon: 'panelExpand', onClick: () => setViewEmail(m) });
        } else {
          out.push({ label: 'Open inbox', icon: 'email', primary: true, onClick: () => scrollToSection('asec-email') });
        }
      } else if (ref?.type === 'action') {
        const a = actionById.get(ref.id);
        if (a) {
          if (onOpenAction && a.ticketKind) {
            out.push({ label: 'Open', icon: 'panelExpand', primary: true, onClick: () => onOpenAction({ kind: a.kind, sourceId: a.sourceId }) });
          }
          if (a.ticketKind) out.push({ label: "I'm on it", icon: 'handshake', onClick: () => void claimAction(a) });
          if (a.customerEmail) out.push({ label: 'Email', icon: 'email', onClick: () => composeTo(emailAddr(a.customerEmail!), a.title, a.who) });
          const ph = phoneForEmail(a.customerEmail);
          if (ph) out.push({ label: 'Call', icon: 'phone', onClick: () => { window.location.href = `tel:${ph}`; } });
          if (out.length === 0) out.push({ label: 'Open actions', icon: 'alerts', primary: true, onClick: () => scrollToSection('asec-actions') });
        } else {
          out.push({ label: 'Open actions', icon: 'alerts', primary: true, onClick: () => scrollToSection('asec-actions') });
        }
      } else if (ref?.type === 'mention') {
        out.push({ label: 'View', icon: 'panelExpand', primary: true, onClick: () => scrollToSection('asec-mentions') });
      } else if (ref?.type === 'call') {
        const c = callById.get(ref.id);
        const ph = c?.contactPhone || phoneForEmail(c?.contactEmail);
        if (ph) out.push({ label: 'Call back', icon: 'phone', primary: true, onClick: () => { window.location.href = `tel:${ph}`; } });
        if (c?.contactEmail) out.push({ label: 'Email', icon: 'email', onClick: () => composeTo(emailAddr(c.contactEmail!), `Following up on your call`, c.contactName ?? undefined) });
        out.push({ label: 'View calls', icon: 'phone', primary: !ph, onClick: () => openCommsPane('calls') });
      } else if (ref?.type === 'calendar') {
        if (wantsSchedule) out.push({ label: 'Schedule', icon: 'calendar', primary: true, onClick: () => openScheduleFor('', item.title) });
        out.push({ label: 'Open calendar', icon: 'calendar', primary: !wantsSchedule, onClick: () => scrollToSection('asec-calendar') });
      } else if (ref?.type === 'recap') {
        out.push({ label: 'View recap', icon: 'sparkles', primary: true, onClick: () => openCommsPane('messages') });
      } else if (ref?.type === 'task') {
        out.push({ label: 'Open tasks', icon: 'check', primary: true, onClick: () => scrollToSection('asec-tasks') });
      } else if (wantsSchedule) {
        out.push({ label: 'Schedule', icon: 'calendar', primary: true, onClick: () => openScheduleFor('', item.title) });
      }

      if (wantsSchedule && !out.some((a) => a.label === 'Schedule')) {
        out.push({ label: 'Schedule', icon: 'calendar', onClick: () => openScheduleFor('', item.title) });
      }
      return out;
    },
    [inboxById, actionById, callById, onOpenAction, openReplyForInbox, openScheduleFor, composeTo, phoneForEmail, openCommsPane],
  );

  const taskContext = useMemo(
    () => ({
      inboxById,
      actionById,
      callById,
      onOpenAction,
      onOpenCustomer,
      onViewEmail: setViewEmail,
      onReplyEmail: openReplyForInbox,
      onComposeEmail: composeTo,
      phoneForEmail,
      openCommsPane,
    }),
    [inboxById, actionById, callById, onOpenAction, onOpenCustomer, openReplyForInbox, composeTo, phoneForEmail, openCommsPane],
  );

  useEffect(() => {
    if (members.length && newTaskAssignees.size === 0 && currentUserId) {
      setNewTaskAssignees(new Set([currentUserId]));
    }
  }, [members.length, currentUserId, newTaskAssignees.size]);

  const addTask = async (
    title: string,
    opts?: AddTaskOptions,
  ): Promise<AssistantTask[]> => {
    const t = title.trim();
    if (!t) return [];
    if (opts?.key) setAddedKeys((prev) => new Set(prev).add(opts.key!));
    const ownerIds =
      opts?.ownerIds?.length
        ? opts.ownerIds
        : newTaskAssignees.size
          ? [...newTaskAssignees]
          : [currentUserId];
    try {
      const created: AssistantTask[] = [];
      for (const ownerId of ownerIds) {
        const task = await createAssistantTask({
          title: t,
          priority: opts?.priority ?? newTaskPriority,
          source: opts?.source,
          sourceRef: opts?.key,
          sourceMeta: opts?.sourceMeta ?? null,
          dueAt: opts?.dueAt ?? null,
          notesHtml: opts?.notesHtml ?? null,
          ownerId,
        });
        created.push(task);
      }
      setTasks((prev) => [...created, ...prev]);
      if (opts?.openDetails !== false && created[0]) {
        setTaskDetailsFocusId(created[0].id);
      }
      return created;
    } catch {
      void loadTasks();
      return [];
    }
  };

  const promptAddTask = useCallback((title: string, opts?: AddTaskOptions) => {
    setAddTaskModal({ title, opts });
  }, []);

  const patchTask = async (id: string, patch: Parameters<typeof updateAssistantTask>[1]) => {
    try {
      const updated = await updateAssistantTask(id, patch);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch {
      void loadTasks();
    }
  };

  // Multi-assign for an existing task. Each person owns their own copy (matching
  // how task creation fans out), so selecting several keeps this row with one
  // owner and creates a copy for each additional member. Existing copies (same
  // title + owner, still open) are skipped so re-applying doesn't duplicate.
  const assignTask = async (task: AssistantTask, ids: string[]) => {
    const selected = [...new Set(ids.filter(Boolean))];
    if (selected.length === 0) selected.push(task.ownerId);
    const keep = selected.includes(task.ownerId) ? task.ownerId : selected[0];
    if (keep !== task.ownerId) await patchTask(task.id, { ownerId: keep });
    const existingOwners = new Set(
      tasks.filter((t) => t.title === task.title && t.status !== 'done').map((t) => t.ownerId),
    );
    existingOwners.add(keep);
    for (const id of selected) {
      if (id === keep || existingOwners.has(id)) continue;
      existingOwners.add(id);
      await addTask(task.title, {
        priority: task.priority,
        source: task.source,
        sourceMeta: task.sourceMeta,
        ownerIds: [id],
      });
    }
  };

  const completeTask = async (t: AssistantTask) => {
    markComplete({ key: `task:${t.id}`, type: 'task', title: t.title, subtitle: PRIORITY_LABEL[t.priority], completedAt: '' });
    await patchTask(t.id, { status: 'done' });
  };

  const removeTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteAssistantTask(id);
    } catch {
      void loadTasks();
    }
  };

  const claimAction = async (a: AssistantAction) => {
    if (!a.ticketKind) return;
    try {
      await updateActionWork({ actionKind: a.ticketKind, sourceId: a.sourceId, op: 'claim' });
      await loadActionWork();
    } catch {
      /* ignore */
    }
  };

  const counts = overview?.counts ?? { actions: 0, mentions: 0, eventsToday: 0, emails: 0, calls: 0 };
  const openTasks = tasks.filter((t) => t.status !== 'done' && !completedKeys.has(`task:${t.id}`));
  const visibleTasks = tasks.filter((t) => !completedKeys.has(`task:${t.id}`) && t.status !== 'done');
  const myTasks = visibleTasks.filter((t) => t.mine);
  const teamTasks = visibleTasks.filter((t) => !t.mine);

  const toggleNewTaskAssignee = (memberId: string) => {
    setNewTaskAssignees((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        if (next.size > 1) next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };
  const aiTriaged = useMemo(
    () => (brief?.triagedEmails ?? []).filter((t) => !completedKeys.has(`email:${t.id}`)),
    [brief?.triagedEmails, completedKeys],
  );
  const aiTriagedIdSet = useMemo(() => new Set(aiTriaged.map((t) => t.id)), [aiTriaged]);
  // Fallback: if the AI brief hasn't triaged anything yet (cold cache / mid-sync),
  // still surface unread inbox mail so "Email to handle" is never blank when there's
  // pending mail (TASK-003).
  const fallbackTriaged = useMemo((): TriagedEmail[] => {
    return (overview?.email.needsAction ?? [])
      .filter((m) => !completedKeys.has(`email:${m.id}`))
      .slice(0, 12)
      .map((m) => {
        const sender = m.fromAddress || emailAddr(m.from);
        return {
          id: m.id,
          contact: m.from,
          business: '',
          title: `Reply to ${m.from}`,
          subject: m.subject,
          insight: 'Unread message awaiting a reply.',
          tag: 'customer' as const,
          section: 'action' as const,
          fromAddress: sender,
          folderId: m.folderId,
          receivedTime: m.receivedTime,
        };
      });
  }, [overview?.email.needsAction, completedKeys]);
  const triaged = useMemo(() => {
    const base = aiTriaged.length > 0 ? aiTriaged : fallbackTriaged;
    const byId = new Map(base.map((t) => [t.id, t]));
    for (const manual of manualPriorityEmails) {
      if (completedKeys.has(`email:${manual.id}`)) continue;
      const live = inboxById.get(manual.id);
      if (live) {
        const meta = inboxEmailMeta(live, contactDirectory, customers);
        byId.set(manual.id, triagedFromInbox(live, meta));
      } else if (!byId.has(manual.id)) {
        byId.set(manual.id, manual);
      }
    }
    const autoCtx = {
      userEmail: mailbox,
      userDisplayName: currentUserName,
      contactDirectory,
      customers,
      agentEmails,
    };
    for (const m of overview?.email.inbox ?? []) {
      if (completedKeys.has(`email:${m.id}`)) continue;
      if (byId.has(m.id)) continue;
      const hit = shouldAutoPrioritizeEmail(m, autoCtx);
      if (!hit) continue;
      const meta = inboxEmailMeta(m, contactDirectory, customers);
      byId.set(m.id, {
        ...triagedFromInbox(m, meta),
        insight: hit.reason,
        tag: hit.tag,
        section: hit.tag === 'urgent' ? 'urgent' : 'action',
      });
    }
    return [...byId.values()];
  }, [
    aiTriaged,
    fallbackTriaged,
    manualPriorityEmails,
    completedKeys,
    inboxById,
    contactDirectory,
    customers,
    overview?.email.inbox,
    mailbox,
    currentUserName,
    agentEmails,
  ]);
  const autoPriorityIdSet = useMemo(() => {
    const ids = new Set<string>();
    const autoCtx = {
      userEmail: mailbox,
      userDisplayName: currentUserName,
      contactDirectory,
      customers,
      agentEmails,
    };
    for (const m of overview?.email.inbox ?? []) {
      if (shouldAutoPrioritizeEmail(m, autoCtx)) ids.add(m.id);
    }
    return ids;
  }, [overview?.email.inbox, mailbox, currentUserName, contactDirectory, customers, agentEmails]);
  const priorityIdSet = useMemo(() => new Set(triaged.map((t) => t.id)), [triaged]);
  const visibleActions = (overview?.actions ?? []).filter((a) => !completedKeys.has(`action:${a.id}`));

  const actionTypeCounts = useMemo(() => {
    const counts: Record<AssistantActionKind, number> = {
      ticket: 0,
      review_request: 0,
      quote_request: 0,
      analysis_review: 0,
      reminder: 0,
    };
    for (const a of visibleActions) counts[a.kind] += 1;
    return counts;
  }, [visibleActions]);

  const filteredActions = useMemo(() => {
    if (actionTypeFilter === 'all') return visibleActions;
    return visibleActions.filter((a) => a.kind === actionTypeFilter);
  }, [visibleActions, actionTypeFilter]);

  const visibleMentions = useMemo(
    () =>
      mentionInbox.filter((m) =>
        mentionFilter === 'unread' ? !m.readAt : Boolean(m.readAt),
      ),
    [mentionInbox, mentionFilter],
  );

  const partOfDay = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  })();
  const briefHeadline = `${greetingForNow()}, ${first} — here's your brief this ${partOfDay}.`;

  // Per-section badge counts shown on the hover-reveal side rail.
  const jumpToSection = useCallback(
    (id: string) => {
      if (id === 'asec-comms') openCommsPane('recent');
      else scrollToSection(id);
    },
    [openCommsPane],
  );

  const sectionCounts: Record<string, number> = {
    'asec-calendar': counts.eventsToday,
    'asec-actions': visibleActions.length,
    'asec-email': triaged.length,
    'asec-tasks': openTasks.length,
    'asec-comms': (overview?.calls.length ?? 0) + (overview?.recaps.length ?? 0),
    'asec-mentions': counts.mentions,
    'asec-completed': completed.length,
  };

  return (
    <>
      <nav className="assist-mobile-section-nav" aria-label="Jump to assistant section">
        <SectionJumpButtons sectionCounts={sectionCounts} onJump={jumpToSection} mobile />
      </nav>
      <div className="assist-stack">
        {/* ── AI WEEK BRIEF ── */}
        <div id="asec-brief" className="assist-anchor">
          <BriefCard
            brief={brief?.brief ?? null}
            busy={briefBusy}
            loading={loading}
            headline={briefHeadline}
            onSync={refresh}
            syncing={refreshing || briefBusy}
            refreshError={briefRefreshError}
            completedKeys={completedKeys}
            onRegenerate={regenerateBrief}
            onRef={openRef}
            actionsFor={briefActionsFor}
            onAddTask={(title, key) => void promptAddTask(title, { source: 'brief', key, priority: 'high' })}
            addedKeys={addedKeys}
            onComplete={({ key, title }) => markComplete({ key, type: 'priority', title, completedAt: '' })}
          />
        </div>

        {/* ── CALENDAR ── */}
        <div id="asec-calendar" className="assist-anchor">
          <CalendarSection
            recapByEvent={recapByEvent}
            addedKeys={addedKeys}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            members={members}
            onAddTask={(title, key) => void promptAddTask(title, { source: 'recap', key, priority: 'normal' })}
            onEmailAttendees={(ev) => {
              const emails = ev.attendees.map((a) => a.email).filter(Boolean);
              if (emails.length === 0) return;
              setComposeQueue([]);
              setCompose({
                to: emails.join(', '),
                subject: `Regarding: ${ev.title}`,
                lookupEmail: emails[0],
                contextLabel: ev.title,
                mode: 'new',
              });
            }}
          />
        </div>

        {/* ── EMAIL TO HANDLE ── */}
        <div id="asec-email" className="assist-anchor">
          <div className="card assist-card">
            <div className="card-header assist-email-head">
              <div className="card-title">
                <AppIcon name="email" size={14} /> Email to handle
              </div>
              <div className="assist-email-toolbar">
                <button type="button" className="assist-mini-btn primary" onClick={openNewEmail}>
                  <AppIcon name="add" size={11} /> New email
                </button>
                <a
                  className="assist-mini-btn"
                  href="https://mail.zoho.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  <AppIcon name="link" size={11} /> View inbox
                </a>
                <div className="assist-tabs assist-email-tabs">
                  <button
                    type="button"
                    className={`assist-tab${emailTab === 'priority' ? ' active' : ''}`}
                    onClick={() => setEmailTab('priority')}
                  >
                    Priority
                    {triaged.length > 0 && (
                      <span className="assist-count-pill assist-count-pill--inline">{triaged.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`assist-tab${emailTab === 'all' ? ' active' : ''}`}
                    onClick={() => setEmailTab('all')}
                  >
                    All mail
                  </button>
                </div>
                {emailTab === 'priority' && triaged.length > 0 && (
                  <button type="button" className="assist-tab" onClick={draftAllReplies}>
                    <AppIcon name="sparkles" size={11} /> Draft all
                  </button>
                )}
              </div>
            </div>
            <div className="card-body assist-scroll">
              {!overview?.email.connected && !loading && (
                <ConnectPrompt
                  title="Connect your mailbox"
                  body="Link Zoho Mail so the assistant can triage what needs a reply."
                  cta="Connect Zoho"
                />
              )}

              {overview?.email.connected && emailTab === 'all' && (
                <div className="assist-email-filters">
                  <label className="assist-email-filter">
                    <span>Subject</span>
                    <input
                      value={allMailFilters.subject}
                      onChange={(e) => setAllMailFilters((f) => ({ ...f, subject: e.target.value }))}
                      placeholder="Search subject…"
                    />
                  </label>
                  <label className="assist-email-filter">
                    <span>Contact</span>
                    <input
                      value={allMailFilters.contact}
                      onChange={(e) => setAllMailFilters((f) => ({ ...f, contact: e.target.value }))}
                      placeholder="Name or email…"
                    />
                  </label>
                  <label className="assist-email-filter">
                    <span>Account</span>
                    <input
                      value={allMailFilters.account}
                      onChange={(e) => setAllMailFilters((f) => ({ ...f, account: e.target.value }))}
                      placeholder="Customer company…"
                    />
                  </label>
                  <label className="assist-email-filter">
                    <span>Vendor</span>
                    <input
                      value={allMailFilters.vendor}
                      onChange={(e) => setAllMailFilters((f) => ({ ...f, vendor: e.target.value }))}
                      placeholder="Supplier / vendor…"
                    />
                  </label>
                </div>
              )}

              {overview?.email.connected && emailTab === 'priority' && triaged.length === 0 && (
                <p className="assist-empty">
                  {brief?.brief.generatedAt
                    ? 'Inbox zero — nothing needs a reply right now.'
                    : 'Run Sync to triage your inbox with AI.'}
                </p>
              )}

              {overview?.email.connected && emailTab === 'priority' &&
                triaged.map((t) => {
                  const item = inboxById.get(t.id);
                  const key = `email:${t.id}`;
                  const replyLabel = `${t.contact}${t.business && t.business !== 'Unknown' ? ` · ${t.business}` : ''}`;
                  const canReply = Boolean(targetForTriaged(t));
                  return (
                    <div key={t.id} className={`assist-triage assist-triage--${t.section}`}>
                      <div className="assist-triage-head">
                        <span className={`assist-tag assist-tag--${t.tag}`}>{TAG_LABEL[t.tag]}</span>
                        {manualPriorityIdSet.has(t.id) && !aiTriagedIdSet.has(t.id) ? (
                          <span className="assist-tag assist-tag--partner">Pinned</span>
                        ) : null}
                        {autoPriorityIdSet.has(t.id) && !aiTriagedIdSet.has(t.id) && !manualPriorityIdSet.has(t.id) ? (
                          <span className="assist-tag assist-tag--renewal">Auto</span>
                        ) : null}
                        {(item?.fromAddress || t.fromAddress) ? (
                          <button
                            type="button"
                            className="assist-triage-contact assist-triage-contact--link"
                            onClick={() =>
                              setContactModal({ email: (item?.fromAddress || t.fromAddress)!, name: t.contact })
                            }
                            title="View contact details & history"
                          >
                            {t.contact}
                            {t.business && t.business !== 'Unknown' ? (
                              <>
                                {' · '}
                                <span className={`assist-triage-org assist-triage-org--${t.tag}`}>
                                  {t.business}
                                </span>
                              </>
                            ) : null}
                          </button>
                        ) : (
                          <span className="assist-triage-contact">
                            {t.contact}
                            {t.business && t.business !== 'Unknown' ? (
                              <>
                                {' · '}
                                <span className={`assist-triage-org assist-triage-org--${t.tag}`}>
                                  {t.business}
                                </span>
                              </>
                            ) : null}
                          </span>
                        )}
                        {(() => {
                          const received = item?.receivedTime ?? t.receivedTime;
                          if (!received) return null;
                          const d = new Date(received);
                          return (
                            <span
                              className="assist-triage-time"
                              title={d.toLocaleString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            >
                              {relativeTime(d.toISOString())} ·{' '}
                              {d.toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          );
                        })()}
                      </div>
                      <button
                        type="button"
                        className="assist-triage-open"
                        onClick={() => openReplyForTriaged(t, replyLabel)}
                        disabled={!canReply}
                      >
                        <div className="assist-triage-title">{t.title}</div>
                        {t.insight && <div className="assist-triage-insight">{t.insight}</div>}
                      </button>
                      <div className="assist-triage-actions">
                        <button
                          type="button"
                          className="assist-mini-btn primary"
                          onClick={() => openReplyForTriaged(t, replyLabel)}
                          disabled={!canReply}
                        >
                          <AppIcon name="sparkles" size={11} /> Reply with AI
                        </button>
                        <button
                          type="button"
                          className={`assist-mini-btn${addedKeys.has(key) ? ' added' : ''}`}
                          onClick={() =>
                            void promptAddTask(`Reply: ${t.title}`, {
                              source: 'email',
                              key,
                              priority: t.tag === 'urgent' ? 'urgent' : 'high',
                              sourceMeta: sourceMetaFromTriagedEmail(t),
                            })
                          }
                          disabled={addedKeys.has(key)}
                        >
                          <AppIcon name={addedKeys.has(key) ? 'check' : 'add'} size={11} />
                          {addedKeys.has(key) ? 'Added' : 'Task'}
                        </button>
                        <button
                          type="button"
                          className="assist-mini-btn done"
                          title="Mark handled"
                          onClick={() => {
                            markComplete({ key, type: 'email', title: t.title, subtitle: t.contact, completedAt: '' });
                            if (manualPriorityIdSet.has(t.id)) removeFromPriority(t.id);
                          }}
                        >
                          <AppIcon name="check" size={11} /> Done
                        </button>
                        {manualPriorityIdSet.has(t.id) && !aiTriagedIdSet.has(t.id) ? (
                          <button
                            type="button"
                            className="assist-mini-btn"
                            title="Remove from priority"
                            onClick={() => removeFromPriority(t.id)}
                          >
                            <AppIcon name="close" size={11} /> Unpin
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

              {overview?.email.connected && emailTab === 'all' && allMailFiltered.length === 0 && (
                <p className="assist-empty">
                  {(overview?.email.inbox.length ?? 0) === 0
                    ? 'No messages in your recent inbox window.'
                    : 'No messages match your filters.'}
                </p>
              )}

              {overview?.email.connected &&
                emailTab === 'all' &&
                allMailFiltered.map((m) => {
                  const meta = inboxEmailMeta(m, contactDirectory, customers);
                  const orgLabel = meta.account ?? meta.vendor;
                  const inPriority = priorityIdSet.has(m.id);
                  const manuallyPinned = manualPriorityIdSet.has(m.id);
                  return (
                    <div
                      key={m.id}
                      className={`assist-triage assist-triage--action${m.isUnread ? ' assist-triage--unread' : ''}`}
                    >
                      <div className="assist-triage-head">
                        {m.isUnread && <span className="assist-tag assist-tag--unread">Unread</span>}
                        <button
                          type="button"
                          className="assist-triage-contact assist-triage-contact--link"
                          onClick={() => setContactModal({ email: meta.contactEmail, name: meta.contactName })}
                        >
                          {meta.contactName}
                          {orgLabel ? (
                            <>
                              {' · '}
                              <span className="assist-triage-org assist-triage-org--customer">{orgLabel}</span>
                            </>
                          ) : null}
                        </button>
                        <span className="assist-triage-time">
                          {relativeTime(new Date(m.receivedTime).toISOString())}
                        </span>
                      </div>
                      <button type="button" className="assist-triage-open" onClick={() => setViewEmail(m)}>
                        <div className="assist-triage-title">{m.subject || '(no subject)'}</div>
                        {m.summary && <div className="assist-triage-insight">{m.summary}</div>}
                      </button>
                      <div className="assist-triage-actions">
                        <button
                          type="button"
                          className={`assist-mini-btn${inPriority ? ' added' : ''}`}
                          disabled={inPriority && !manuallyPinned}
                          title={
                            inPriority && !manuallyPinned
                              ? 'Already in priority (AI triaged)'
                              : manuallyPinned
                                ? 'Remove from priority'
                                : 'Add to priority inbox'
                          }
                          onClick={() => {
                            if (manuallyPinned) removeFromPriority(m.id);
                            else addToPriority(m);
                          }}
                        >
                          <AppIcon name={inPriority ? 'check' : 'alerts'} size={11} />
                          {inPriority ? (manuallyPinned ? 'Priority' : 'In priority') : 'Add to priority'}
                        </button>
                        <button
                          type="button"
                          className="assist-mini-btn"
                          onClick={() => setViewEmail(m)}
                        >
                          <AppIcon name="panelExpand" size={11} /> View
                        </button>
                        <button
                          type="button"
                          className="assist-mini-btn primary"
                          onClick={() => openReplyForInbox(m, meta.contactName)}
                        >
                          <AppIcon name="sparkles" size={11} /> Reply with AI
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* ── PORTAL ACTIONS & TICKETS ── */}
        <div id="asec-actions" className="assist-anchor">
          <div className="card assist-card">
            <div className="card-header assist-email-head">
              <div className="card-title">
                <AppIcon name="alerts" size={14} /> Portal actions &amp; tickets
              </div>
              <div className="assist-comms-filters" role="tablist" aria-label="Action type filter">
                {ACTION_TYPE_FILTERS.map(({ id, label }) => {
                  const count = id === 'all' ? visibleActions.length : actionTypeCounts[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={actionTypeFilter === id}
                      className={`assist-comms-pill${actionTypeFilter === id ? ' active' : ''}`}
                      onClick={() => setActionTypeFilter(id)}
                    >
                      {label}
                      {count > 0 && <span className="assist-seg-count">{count}</span>}
                    </button>
                  );
                })}
              </div>
              <span className="assist-count-pill">{filteredActions.length}</span>
            </div>
            <div className="card-body assist-scroll">
              {filteredActions.length === 0 && !loading && (
                <p className="assist-empty">
                  {actionTypeFilter === 'all'
                    ? 'Inbox zero on portal work. Nice.'
                    : `No ${ACTION_KIND_LABEL[actionTypeFilter].toLowerCase()} right now.`}
                </p>
              )}
              {filteredActions.slice(0, 24).map((a) => {
                const work = a.ticketKind ? actionWork[`${a.ticketKind}:${a.sourceId}`] : undefined;
                const claimers = work?.claimerNames ?? [];
                const mineClaimed = work?.claimerIds.includes(currentUserId) ?? false;
                const addKey = `action:${a.id}`;
                return (
                  <div key={a.id} className="assist-actionrow">
                    <div className="assist-actionrow-main">
                      <span className={`assist-dot assist-dot--${a.urgency}`} />
                      <span className="assist-action-icon">
                        <AppIcon name={ACTION_ICON[a.kind] ?? 'alerts'} size={13} />
                      </span>
                      <div className="assist-action-body">
                        <div className="assist-action-title">{a.title}</div>
                        <div className="assist-action-sub">
                          {a.subtitle}
                          {a.who ? (
                            <>
                              {' · '}
                              {(() => {
                                const cid = resolveCustomerId(a);
                                return cid && onOpenCustomer ? (
                                  <button
                                    type="button"
                                    className="assist-customer-link"
                                    onClick={() => onOpenCustomer(cid)}
                                  >
                                    {a.who}
                                  </button>
                                ) : (
                                  a.who
                                );
                              })()}
                            </>
                          ) : null}
                          {a.dueAt ? ` · due ${fmtDue(a.dueAt)}` : ''}
                        </div>
                        {claimers.length > 0 && (
                          <div className="assist-action-claimers">
                            <AppIcon name="specialist" size={9} /> {claimers.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="assist-actionrow-tools">
                      {a.ticketKind && (
                        <button
                          type="button"
                          className={`assist-mini-btn${mineClaimed ? ' added' : ''}`}
                          onClick={() => void claimAction(a)}
                          disabled={mineClaimed}
                        >
                          <AppIcon name={mineClaimed ? 'check' : 'handshake'} size={11} />
                          {mineClaimed ? "I'm on it" : "I'm on it"}
                        </button>
                      )}
                      {onOpenAction && a.ticketKind && (
                        <button
                          type="button"
                          className="assist-mini-btn primary"
                          onClick={() => onOpenAction({ kind: a.kind, sourceId: a.sourceId })}
                        >
                          <AppIcon name="panelExpand" size={11} /> Open
                        </button>
                      )}
                      <button
                        type="button"
                        className="assist-mini-btn"
                        onClick={() => setOpenActionThread(openActionThread === a.id ? null : a.id)}
                      >
                        <AppIcon name="messages" size={11} /> Discuss
                      </button>
                      <button
                        type="button"
                        className={`assist-mini-btn${addedKeys.has(addKey) ? ' added' : ''}`}
                        onClick={() =>
                          void promptAddTask(a.title, {
                            source: 'action',
                            key: addKey,
                            priority: a.urgency === 'urgent' ? 'urgent' : 'high',
                            sourceMeta: sourceMetaFromAction(a),
                          })
                        }
                        disabled={addedKeys.has(addKey)}
                      >
                        <AppIcon name={addedKeys.has(addKey) ? 'check' : 'add'} size={11} /> Task
                      </button>
                      <button
                        type="button"
                        className="assist-mini-btn done"
                        title="Mark done"
                        onClick={() =>
                          markComplete({ key: `action:${a.id}`, type: 'action', title: a.title, subtitle: a.who, completedAt: '' })
                        }
                      >
                        <AppIcon name="check" size={11} /> Done
                      </button>
                    </div>
                    {openActionThread === a.id && <TaskThread taskId={a.id} contextType="action" members={members} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── TASKS ── */}
        <div id="asec-tasks" className="assist-anchor">
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="check" size={14} /> Priorities &amp; tasks
              </div>
              <span className="assist-count-pill">
                {myTasks.length} mine · {teamTasks.length} team
              </span>
            </div>
            <div className="card-body assist-tasks-card-body">
              <AssistantTasksPanel
                tasks={tasks}
                members={members}
                currentUserId={currentUserId}
                loading={loading}
                newTaskPriority={newTaskPriority}
                newTaskAssignees={newTaskAssignees}
                focusDetailsTaskId={taskDetailsFocusId}
                onFocusDetailsHandled={() => setTaskDetailsFocusId(null)}
                onToggleNewTaskAssignee={toggleNewTaskAssignee}
                onNewTaskPriorityChange={setNewTaskPriority}
                onAddTask={addTask}
                onPatchTask={(id, patch) => void patchTask(id, patch)}
                onCompleteTask={(t) => void completeTask(t)}
                onRemoveTask={(id) => void removeTask(id)}
                onAssignTask={(t, ids) => void assignTask(t, ids)}
                taskContext={taskContext}
              />
            </div>
          </div>
        </div>

        {/* ── COMMUNICATIONS (calls · messages · voicemails) ── */}
        <div id="asec-comms" className="assist-anchor">
          <span id="asec-calls" className="assist-anchor-offset" aria-hidden="true" />
          <span id="asec-recaps" className="assist-anchor-offset" aria-hidden="true" />
          <div className="card assist-card">
            <div className="card-header assist-comms-header">
              <div className="assist-comms-header-top">
                <div className="card-title">
                  <AppIcon name="phone" size={14} /> Communications
                </div>
                {(commsFilter === 'calls' || commsFilter === 'voicemails') && (
                  <div className="assist-comms-header-actions">
                    <div className="assist-seg" role="group" aria-label="Call scope">
                      <button
                        type="button"
                        className={`assist-seg-btn${callsScope === 'mine' ? ' active' : ''}`}
                        onClick={() => setCallsScope('mine')}
                      >
                        Mine
                      </button>
                      <button
                        type="button"
                        className={`assist-seg-btn${callsScope === 'team' ? ' active' : ''}`}
                        onClick={() => setCallsScope('team')}
                      >
                        Team
                      </button>
                    </div>
                    {commsFilter === 'calls' && (
                      <>
                        <button
                          type="button"
                          className="assist-mini-btn"
                          onClick={() => void runDialpadDiag()}
                          disabled={dialpadDiagLoading}
                          title="Test Dialpad API connection"
                        >
                          <AppIcon name="bolt" size={11} className={dialpadDiagLoading ? 'spin' : undefined} />{' '}
                          {dialpadDiagLoading ? 'Testing…' : 'Test'}
                        </button>
                        {overview?.callsConnected && (
                          <button
                            type="button"
                            className="assist-mini-btn"
                            onClick={() => void syncCalls()}
                            disabled={syncingCalls}
                          >
                            <AppIcon name="sync" size={11} className={syncingCalls ? 'spin' : undefined} />{' '}
                            {syncingCalls ? 'Syncing…' : 'Sync'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="assist-comms-filters" role="tablist" aria-label="Communications filter">
                {(
                  [
                    ['recent', 'Recent', (overview?.calls.length ?? 0) + (overview?.recaps.length ?? 0)],
                    ['calls', 'Calls', allCalls.length],
                    ['messages', 'Messages', overview?.recaps.length ?? 0],
                    ['voicemails', 'Voicemails', voicemailCalls.length],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={commsFilter === id}
                    className={`assist-comms-pill${commsFilter === id ? ' active' : ''}`}
                    onClick={() => setCommsFilter(id)}
                  >
                    {label}
                    {count > 0 && <span className="assist-seg-count">{count}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="card-body assist-scroll">
              {commsFilter === 'recent' && (
                <>
                  {commFeedRecent.length === 0 && !loading && (
                    <p className="assist-empty">No recent calls or messages yet.</p>
                  )}
                  {commFeedRecent.map((item) => (
                    <CommRecentRow
                      key={item.id}
                      item={item}
                      onOpenCustomer={onOpenCustomer}
                      onEmail={(email, name) => composeTo(email, `Following up`, name)}
                      onAddTask={(title, key, meta) =>
                        void promptAddTask(title, {
                          source: item.kind === 'call' ? 'call' : 'recap',
                          key,
                          priority: 'normal',
                          sourceMeta: meta,
                        })
                      }
                      added={addedKeys.has(item.kind === 'call' ? `call:${item.call.id}` : `recap:${item.recap.id}`)}
                    />
                  ))}
                </>
              )}
              {commsFilter === 'calls' && (
                <>
                  {!overview?.callsConnected && !loading && (
                    <p className="assist-empty">
                      Dialpad isn&apos;t connected. Add <code>DIALPAD_API_KEY</code> to enable call history.
                    </p>
                  )}
                  {overview?.callsConnected && allCalls.length === 0 && !loading && (
                    <p className="assist-empty">No recent calls logged yet.</p>
                  )}
                  {allCalls.map((c) => (
                    <CallRow
                      key={c.id}
                      call={c}
                      onOpenCustomer={onOpenCustomer}
                      onEmail={(email, name) => composeTo(email, `Following up on our call`, name)}
                      onAddTask={(title, key, meta) =>
                        void promptAddTask(title, { source: 'call', key, priority: 'normal', sourceMeta: meta })
                      }
                      added={addedKeys.has(`call:${c.id}`)}
                    />
                  ))}
                </>
              )}
              {commsFilter === 'messages' && (
                <>
                  {(overview?.recaps.length ?? 0) === 0 && !loading && (
                    <p className="assist-empty">No call recap messages yet.</p>
                  )}
                  {(overview?.recaps ?? []).slice(0, 20).map((r) => (
                    <RecapBlock
                      key={r.id}
                      recap={r}
                      addedKeys={addedKeys}
                      onAddTask={(title, key, meta) =>
                        void promptAddTask(title, { source: 'recap', key, priority: 'normal', sourceMeta: meta })
                      }
                      onEmail={() => {
                        const addr = emailAddr(r.from);
                        if (addr) composeTo(addr, `Re: ${r.title}`, r.title);
                      }}
                    />
                  ))}
                </>
              )}
              {commsFilter === 'voicemails' && (
                <>
                  {voicemailCalls.length === 0 && !loading && (
                    <p className="assist-empty">No voicemails or missed calls logged yet.</p>
                  )}
                  {voicemailCalls.map((c) => (
                    <CallRow
                      key={c.id}
                      call={c}
                      onOpenCustomer={onOpenCustomer}
                      onEmail={(email, name) => composeTo(email, `Following up on your voicemail`, name)}
                      onAddTask={(title, key, meta) =>
                        void promptAddTask(title, { source: 'call', key, priority: 'high', sourceMeta: meta })
                      }
                      added={addedKeys.has(`call:${c.id}`)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── MENTIONS ── */}
        <div id="asec-mentions" className="assist-anchor">
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="specialist" size={14} /> My mentions
              </div>
              <div className="assist-mention-toolbar">
                <div className="assist-seg" role="group" aria-label="Mention filter">
                  <button
                    type="button"
                    className={`assist-seg-btn${mentionFilter === 'unread' ? ' active' : ''}`}
                    onClick={() => setMentionFilter('unread')}
                  >
                    Unread
                  </button>
                  <button
                    type="button"
                    className={`assist-seg-btn${mentionFilter === 'read' ? ' active' : ''}`}
                    onClick={() => setMentionFilter('read')}
                  >
                    Read
                  </button>
                </div>
                <span className="assist-count-pill">{counts.mentions}</span>
                {onOpenMessageCenter && (
                  <button type="button" className="assist-mini-btn" onClick={onOpenMessageCenter}>
                    <AppIcon name="messages" size={11} /> Message Center
                  </button>
                )}
              </div>
            </div>
            <div className="card-body assist-scroll">
              {visibleMentions.length === 0 && !loading && (
                <p className="assist-empty">
                  {mentionFilter === 'unread'
                    ? 'No unread mentions.'
                    : 'No read mentions yet.'}
                </p>
              )}
              {visibleMentions.map((m) => (
                <div key={m.notificationId} className="assist-mention">
                  <div className="assist-mention-head">
                    <strong>{m.authorName}</strong>
                    <span className="assist-mention-ctx">{m.contextLabel}</span>
                    <span className="assist-mention-time">{relativeTime(m.createdAt)}</span>
                  </div>
                  <div
                    className="assist-mention-body"
                    dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
                  />
                  <div className="assist-mention-actions">
                    <button
                      type="button"
                      className="assist-link-btn"
                      onClick={() => {
                        setMentionReplyFor(
                          mentionReplyFor === m.notificationId ? null : m.notificationId,
                        );
                        setMentionReplyDraft('');
                      }}
                    >
                      <AppIcon name="send" size={11} /> Reply
                    </button>
                    {!m.readAt && (
                      <button
                        type="button"
                        className="assist-link-btn"
                        onClick={() =>
                          void markMentionsRead([m.notificationId]).then(() =>
                            Promise.all([loadMentionInbox(), loadOverview()]),
                          )
                        }
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  {mentionReplyFor === m.notificationId && (
                    <div className="assist-mention-reply">
                      <textarea
                        className="assist-mention-reply-input"
                        rows={2}
                        placeholder="Reply… @mention to notify"
                        value={mentionReplyDraft}
                        onChange={(e) => setMentionReplyDraft(e.target.value)}
                      />
                      <button
                        type="button"
                        className="assist-btn assist-btn--primary"
                        disabled={!mentionReplyDraft.trim()}
                        onClick={() => void submitMentionReply(m)}
                      >
                        Post reply
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── COMPLETED TODAY ── */}
        <div id="asec-completed" className="assist-anchor">
          <div className="card assist-card assist-completed-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="check" size={14} /> Completed today
              </div>
              <span className="assist-count-pill">{completed.length}</span>
            </div>
            <div className="card-body assist-scroll">
              {completed.length === 0 && (
                <p className="assist-empty">Nothing checked off yet. Cleared items land here.</p>
              )}
              {completed.map((c) => (
                <div key={c.key} className="assist-completed-item">
                  <span className="assist-completed-check">
                    <AppIcon name="check" size={11} />
                  </span>
                  <div className="assist-completed-body">
                    <div className="assist-completed-title">{c.title}</div>
                    <div className="assist-completed-sub">
                      <span className="assist-completed-type">{c.type}</span>
                      {c.subtitle ? ` · ${c.subtitle}` : ''} · {relativeTime(c.completedAt)}
                    </div>
                  </div>
                  <button type="button" className="assist-mini-btn" onClick={() => reopenCompleted(c.key)}>
                    <AppIcon name="sync" size={11} /> Reopen
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {mounted &&
        createPortal(
          <nav className="acct-section-rail assist-section-rail" aria-label="Jump to assistant section">
            <SectionJumpButtons sectionCounts={sectionCounts} onJump={jumpToSection} />
          </nav>,
          document.body,
        )}

      {compose && (
        <ComposeModal
          target={compose}
          queueRemaining={composeQueue.length}
          currentUserName={currentUserName}
          mailbox={overview?.email.mailbox ?? ''}
          onClose={handleComposeClose}
          onSent={(handled) => {
            if (handled && compose.emailId) {
              markComplete({
                key: `email:${compose.emailId}`,
                type: 'email',
                title: compose.contextLabel ?? compose.subject,
                subtitle: 'Replied',
                completedAt: '',
              });
            }
          }}
        />
      )}
      {viewEmail && (
        <ViewEmailModal
          item={viewEmail}
          onClose={() => setViewEmail(null)}
          onReply={() => {
            const item = viewEmail;
            setViewEmail(null);
            openReplyForInbox(item);
          }}
        />
      )}
      {scheduleTarget && (
        <EventEditModal
          event={null}
          defaultDate={new Date()}
          prefill={{ title: scheduleTarget.title, attendees: scheduleTarget.attendees }}
          onClose={() => setScheduleTarget(null)}
          onSaved={() => {
            setScheduleTarget(null);
          }}
        />
      )}
      {addTaskModal && (
        <AddTaskModal
          title={addTaskModal.title}
          defaultPriority={addTaskModal.opts?.priority ?? newTaskPriority}
          defaultAssignees={newTaskAssignees}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setAddTaskModal(null)}
          onSubmit={async (values) => {
            await addTask(values.title, {
              ...addTaskModal.opts,
              priority: values.priority,
              dueAt: values.dueAt,
              ownerIds: values.ownerIds,
              openDetails: true,
            });
            setAddTaskModal(null);
          }}
        />
      )}
      {contactModal && (
        <ContactDetailModal
          email={contactModal.email}
          fallbackName={contactModal.name}
          onClose={() => setContactModal(null)}
          onEmail={() => {
            const email = contactModal.email;
            const name = contactModal.name;
            setContactModal(null);
            composeTo(email, '', name);
          }}
          onOpenCustomer={
            onOpenCustomer
              ? (id) => {
                  setContactModal(null);
                  onOpenCustomer(id);
                }
              : undefined
          }
        />
      )}
      {dialpadDiag && (
        <DialpadDiagModal diag={dialpadDiag} onClose={() => setDialpadDiag(null)} />
      )}
      <MyAssistantHankPanel />
    </>
  );
}

// ── AI WEEK BRIEF ──────────────────────────────────────────────────
function BriefCard({
  brief,
  busy,
  loading,
  headline,
  onSync,
  syncing,
  refreshError,
  completedKeys,
  onRegenerate,
  onRef,
  actionsFor,
  onAddTask,
  addedKeys,
  onComplete,
}: {
  brief: AssistantBriefResult['brief'] | null;
  busy: boolean;
  loading: boolean;
  headline: string;
  onSync: () => void;
  syncing: boolean;
  refreshError: string | null;
  completedKeys: Set<string>;
  onRegenerate: () => void;
  onRef: (ref: AssistantRef | null | undefined) => void;
  actionsFor: (item: BriefItemLike) => BriefAction[];
  onAddTask: (title: string, key: string, meta?: import('@/lib/assistant/task-source').AssistantTaskSourceMeta) => void;
  addedKeys: Set<string>;
  onComplete: (item: { key: string; title: string }) => void;
}) {
  const [soFarOpen, setSoFarOpen] = useState(false);
  const missed = (brief?.missed ?? []).filter((m) => !completedKeys.has(`missed:${m.title}`));
  const hasBrief =
    brief && (brief.weekStatus || brief.priorities.length || brief.highlights.length || missed.length);
  const timeLabel = brief?.generatedAt ? briefGeneratedLabel(brief.generatedAt) : '';
  return (
    <div className="card assist-brief">
      <div className="assist-brief-head">
        <div className="assist-brief-titlewrap">
          <div className="assist-brief-title">
            <AppIcon name="sparkles" size={16} /> {headline}
          </div>
          {timeLabel && (
            <span className={`assist-brief-time${refreshError ? ' assist-brief-time--stale' : ''}`}>
              {timeLabel}
            </span>
          )}
        </div>
        <div className="assist-brief-headbtns">
          <button type="button" className="assist-brief-refresh" onClick={onSync} disabled={syncing}>
            <AppIcon name="sync" size={12} className={syncing ? 'spin' : undefined} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {refreshError && (
        <div className="assist-brief-error" role="alert">
          <AppIcon name="warning" size={14} />
          <div>
            <strong>Couldn&apos;t refresh brief</strong>
            <p>{refreshError}</p>
            {hasBrief && brief?.generatedAt && (
              <p className="assist-brief-error-note">
                Showing the last successful brief from {relativeTime(brief.generatedAt)}.
              </p>
            )}
          </div>
        </div>
      )}

      {busy && !hasBrief && (
        <div className="assist-brief-loading">
          <span className="assist-spinner" /> Reading your week…
        </div>
      )}

      {!busy && !hasBrief && !loading && (
        <div className="assist-brief-empty">
          <p>
            {refreshError
              ? 'Brief generation failed — fix the issue above and try again.'
              : 'Generate an AI brief of your meetings, calls, and inbox to see where to start.'}
          </p>
          <button type="button" className="assist-brief-cta" onClick={onRegenerate} disabled={busy}>
            <AppIcon name="sparkles" size={13} /> {refreshError ? 'Retry brief' : 'Generate brief'}
          </button>
        </div>
      )}

      {hasBrief && (
        <div className="assist-brief-body">
          {brief!.recommendation && (() => {
            const recActions = actionsFor({
              title: brief!.recommendation,
              why: '',
              ref: brief!.recommendationRef,
              intent: brief!.recommendationIntent,
            });
            return (
              <div className="assist-brief-rec">
                <span className="assist-brief-rec-label">
                  <AppIcon name="bolt" size={12} /> Start here
                </span>
                <span className="assist-brief-rec-text">{brief!.recommendation}</span>
                {recActions.length > 0 && (
                  <div className="assist-brief-rec-actions">
                    {recActions.map((a, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`assist-mini-btn${a.primary ? ' primary' : ''}`}
                        onClick={a.onClick}
                      >
                        <AppIcon name={a.icon} size={11} /> {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          {brief!.weekStatus && <div className="assist-brief-status">{brief!.weekStatus}</div>}
          <div className="assist-brief-stack">
            {brief!.highlights.length > 0 && (
              <div className="assist-brief-section assist-brief-sofar">
                <button
                  type="button"
                  className="assist-brief-label assist-brief-label--toggle"
                  onClick={() => setSoFarOpen((o) => !o)}
                  aria-expanded={soFarOpen}
                >
                  <AppIcon name="check" size={11} /> So far
                  <span className="assist-brief-sofar-count">{brief!.highlights.length}</span>
                  <AppIcon
                    name={soFarOpen ? 'panelCollapse' : 'panelExpand'}
                    size={11}
                    className="assist-brief-sofar-chev"
                  />
                </button>
                {soFarOpen && (
                  <ul className="assist-brief-highlights">
                    {brief!.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {brief!.priorities.length > 0 && (
              <div className="assist-brief-section assist-brief-section--priorities">
                <div className="assist-brief-label">
                  <AppIcon name="alerts" size={11} /> Priorities now
                </div>
                <ol className="assist-brief-priorities">
                  {brief!.priorities
                    .filter((p) => !completedKeys.has(`priority:${p.title}`))
                    .map((p, i) => {
                      const key = `prio:${p.title}`;
                      const pActions = actionsFor(p);
                      const primary = pActions.find((a) => a.primary) ?? pActions[0];
                      return (
                        <li key={i} className="assist-prio-row">
                          <span className="assist-brief-pnum">{i + 1}</span>
                          <div className="assist-brief-pcontent">
                            <button
                              type="button"
                              className={`assist-brief-ptitle-btn${primary ? ' clickable' : ''}`}
                              onClick={() => (primary ? primary.onClick() : onRef(p.ref))}
                              disabled={!primary && !p.ref}
                            >
                              <span className="assist-brief-ptitle">{p.title}</span>
                              {primary && <span className="assist-brief-pgo">→</span>}
                            </button>
                            {p.why && <span className="assist-brief-pwhy">{p.why}</span>}
                            {p.since && (
                              <span className="assist-brief-psince">
                                <AppIcon name="clock" size={9} /> first mentioned {fmtSince(p.since)}
                              </span>
                            )}
                            <div className="assist-prio-actions">
                              {pActions.map((a, ai) => (
                                <button
                                  key={ai}
                                  type="button"
                                  className={`assist-mini-btn${a.primary ? ' primary' : ''}`}
                                  onClick={a.onClick}
                                >
                                  <AppIcon name={a.icon} size={10} /> {a.label}
                                </button>
                              ))}
                              <button
                                type="button"
                                className={`assist-mini-btn${addedKeys.has(key) ? ' added' : ''}`}
                                onClick={() => onAddTask(p.title, key)}
                                disabled={addedKeys.has(key)}
                              >
                                <AppIcon name={addedKeys.has(key) ? 'check' : 'add'} size={10} /> Task
                              </button>
                              <button
                                type="button"
                                className="assist-mini-btn done"
                                onClick={() => onComplete({ key: `priority:${p.title}`, title: p.title })}
                              >
                                <AppIcon name="check" size={10} /> Done
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                </ol>
              </div>
            )}
          </div>

          {missed.length > 0 && (
            <div className="assist-brief-section assist-brief-missed">
              <div className="assist-brief-label assist-brief-label--warn">
                <AppIcon name="alerts" size={11} /> What you missed
                <span className="assist-brief-missed-sub">carried over from earlier days</span>
              </div>
              <ul className="assist-brief-missed-list">
                {missed.slice(0, 8).map((m, i) => {
                  const mActions = actionsFor(m);
                  const primary = mActions.find((a) => a.primary) ?? mActions[0];
                  return (
                    <li key={i} className="assist-missed-row">
                      <button
                        type="button"
                        className={`assist-missed-main${primary ? ' clickable' : ''}`}
                        onClick={() => (primary ? primary.onClick() : onRef(m.ref))}
                        disabled={!primary && !m.ref}
                      >
                        <span className="assist-missed-title">{m.title}</span>
                        {m.why && <span className="assist-missed-why">{m.why}</span>}
                      </button>
                      <span className="assist-missed-since">
                        <AppIcon name="clock" size={9} /> {fmtSince(m.since)}
                      </span>
                      <div className="assist-missed-actions">
                        {mActions.slice(0, 2).map((a, ai) => (
                          <button
                            key={ai}
                            type="button"
                            className={`assist-mini-btn${a.primary ? ' primary' : ''}`}
                            onClick={a.onClick}
                          >
                            <AppIcon name={a.icon} size={10} /> {a.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="assist-mini-btn done"
                          title="Mark done"
                          onClick={() => onComplete({ key: `missed:${m.title}`, title: m.title })}
                        >
                          <AppIcon name="check" size={10} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CALENDAR (day default + week toggle, navigation, detail, CRUD) ──
function startOfWeek(offset: number): Date {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Index (0=Mon..6=Sun) of today within the current week, or 0. */
function todayWeekIndex(): number {
  const dow = new Date().getDay();
  return dow === 0 ? 6 : dow - 1;
}

function eventStatus(ev: AssistantCalendarEvent): 'now' | 'past' | null {
  const now = Date.now();
  const s = new Date(ev.start).getTime();
  const e = new Date(ev.end).getTime();
  if (now >= s && now < e) return 'now';
  if (now >= e) return 'past';
  return null;
}

function CalendarSection({
  recapByEvent,
  addedKeys,
  currentUserId,
  currentUserName,
  members,
  onAddTask,
  onEmailAttendees,
}: {
  recapByEvent: Map<string, AssistantRecap>;
  addedKeys: Set<string>;
  currentUserId: string;
  currentUserName: string;
  members: TeamMember[];
  onAddTask: (title: string, key: string, meta?: import('@/lib/assistant/task-source').AssistantTaskSourceMeta) => void;
  onEmailAttendees: (ev: AssistantCalendarEvent) => void;
}) {
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeDay, setActiveDay] = useState(todayWeekIndex());
  const [events, setEvents] = useState<AssistantCalendarEvent[]>([]);
  const [weekRecaps, setWeekRecaps] = useState<AssistantRecap[]>([]);
  const [state, setState] = useState<{ connected: boolean; scope: boolean; loading: boolean; error?: string }>({
    connected: false,
    scope: false,
    loading: true,
  });
  const [detail, setDetail] = useState<AssistantCalendarEvent | null>(null);
  const [editing, setEditing] = useState<AssistantCalendarEvent | 'new' | null>(null);
  const [scheduleAI, setScheduleAI] = useState(false);

  const load = useCallback(async (offset: number) => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetchCalendarWeek(offset);
      setEvents(res.events);
      setWeekRecaps(res.recaps ?? []);
      setState({ connected: res.connected, scope: res.calendarScope, loading: false, error: res.error });
    } catch (e) {
      setEvents([]);
      setWeekRecaps([]);
      setState({ connected: false, scope: false, loading: false, error: e instanceof Error ? e.message : 'Failed' });
    }
  }, []);

  // Recaps matched to this week's events take priority; fall back to the
  // overview's matches so the panel still shows recaps before the week loads.
  const weekRecapByEvent = useMemo(() => {
    const map = new Map(recapByEvent);
    for (const r of weekRecaps) if (r.matchedEventId) map.set(r.matchedEventId, r);
    return map;
  }, [recapByEvent, weekRecaps]);

  useEffect(() => {
    void load(weekOffset);
  }, [load, weekOffset]);

  const goWeek = (delta: number) => {
    const next = weekOffset + delta;
    setWeekOffset(next);
    setActiveDay(next === 0 ? todayWeekIndex() : 0);
  };

  const weekStart = startOfWeek(weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const weekEnd = days[6];
  const todayKey = `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()}`;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AssistantCalendarEvent[]>();
    for (const ev of events) {
      const k = dayKey(ev.start);
      const arr = map.get(k) ?? [];
      arr.push(ev);
      map.set(k, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    }
    return map;
  }, [events]);

  const rangeLabel = `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS[weekEnd.getMonth()]} ${weekEnd.getDate()}`;
  const selectedDay = days[activeDay] ?? days[0];
  const selectedKey = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  return (
    <div className="card assist-card">
      <div className="card-header">
        <div className="card-title">
          <AppIcon name="calendar" size={14} /> Calendar
        </div>
        <div className="assist-cal-nav">
          <div className="assist-cal-modes">
            <button type="button" className={`assist-cal-mode${mode === 'day' ? ' active' : ''}`} onClick={() => setMode('day')}>
              Day
            </button>
            <button type="button" className={`assist-cal-mode${mode === 'week' ? ' active' : ''}`} onClick={() => setMode('week')}>
              Week
            </button>
          </div>
          <button type="button" className="assist-cal-navbtn" onClick={() => goWeek(-1)} aria-label="Previous week">
            <AppIcon name="panelCollapse" size={12} />
          </button>
          <button type="button" className={`assist-cal-today${weekOffset === 0 ? ' active' : ''}`} onClick={() => goWeek(-weekOffset)}>
            {weekOffset === 0 ? 'This week' : 'Today'}
          </button>
          <button type="button" className="assist-cal-navbtn" onClick={() => goWeek(1)} aria-label="Next week">
            <AppIcon name="panelExpand" size={12} />
          </button>
          <span className="assist-cal-range">{rangeLabel}</span>
          <button type="button" className="assist-cal-add" onClick={() => setEditing('new')}>
            <AppIcon name="add" size={11} /> New event
          </button>
          <button
            type="button"
            className="assist-cal-add assist-cal-schedule"
            onClick={() => setScheduleAI(true)}
            title="Describe a meeting in plain language and let Hank find a time"
          >
            <AppIcon name="sparkles" size={11} /> Schedule for me
          </button>
        </div>
      </div>

      {state.scope && (
        <div className="assist-day-tabs">
          {days.map((d, i) => {
            const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const count = eventsByDay.get(k)?.length ?? 0;
            const isToday = k === todayKey;
            return (
              <button
                key={k}
                type="button"
                className={`assist-day-tab${mode === 'day' && i === activeDay ? ' active' : ''}${isToday ? ' today' : ''}`}
                onClick={() => {
                  setActiveDay(i);
                  setMode('day');
                }}
              >
                <span className="assist-day-name">{DOW[d.getDay()]}</span>
                <span className="assist-day-date">{d.getDate()}</span>
                <span className="assist-day-count">{count ? `${count} mtg${count === 1 ? '' : 's'}` : '—'}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="card-body">
        {!state.connected && !state.loading && (
          <ConnectPrompt
            title="Connect your Zoho calendar"
            body="Link your Zoho mailbox to pull in meetings and Dialpad call recaps."
            cta="Connect Zoho"
          />
        )}
        {state.connected && !state.scope && (
          <ConnectPrompt
            title="Enable calendar access"
            body="Your Zoho is connected for email. Reconnect to grant calendar access so meetings show here."
            cta="Reconnect Zoho"
          />
        )}

        {state.scope && mode === 'day' && (
          <div className="assist-dayview">
            {selectedEvents.length === 0 && <p className="assist-empty">No meetings scheduled this day.</p>}
            {selectedEvents.map((ev) => (
              <DayEventCard
                key={ev.id}
                event={ev}
                recap={weekRecapByEvent.get(ev.id) ?? null}
                addedKeys={addedKeys}
                onAddTask={onAddTask}
                onOpen={() => setDetail(ev)}
                onEmail={() => onEmailAttendees(ev)}
              />
            ))}
          </div>
        )}

        {state.scope && mode === 'week' && (
          <div className="assist-week">
            {days.map((d) => {
              const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const dayEvents = eventsByDay.get(k) ?? [];
              const isToday = k === todayKey;
              return (
                <div key={k} className={`assist-weekday${isToday ? ' today' : ''}`}>
                  <div className="assist-weekday-head">
                    <span className="assist-weekday-name">{DOW[d.getDay()]}</span>
                    <span className="assist-weekday-date">{d.getDate()}</span>
                  </div>
                  <div className="assist-weekday-events">
                    {dayEvents.length === 0 && <span className="assist-weekday-empty">—</span>}
                    {dayEvents.map((ev) => {
                      const recap = weekRecapByEvent.get(ev.id) ?? null;
                      return (
                        <button key={ev.id} type="button" className="assist-cal-event" onClick={() => setDetail(ev)}>
                          <span className="assist-cal-event-time">
                            {ev.allDay ? 'All day' : fmtClock(new Date(ev.start))}
                          </span>
                          <span className="assist-cal-event-title">{ev.title}</span>
                          <span className="assist-cal-event-meta">
                            {ev.attendeeCount > 0 && (
                              <span className="assist-cal-event-att">
                                <AppIcon name="specialist" size={9} /> {ev.attendeeCount}
                              </span>
                            )}
                            {recap && (
                              <span className="assist-cal-event-recap">
                                <AppIcon name="sparkles" size={9} /> Recap
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {state.error && <p className="assist-empty">Calendar error: {state.error}</p>}
      </div>

      {detail && (
        <EventDetailModal
          event={detail}
          recap={weekRecapByEvent.get(detail.id) ?? null}
          addedKeys={addedKeys}
          onAddTask={onAddTask}
          onEmail={() => {
            onEmailAttendees(detail);
            setDetail(null);
          }}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onDelete={async () => {
            try {
              await deleteCalendarEvent(detail.id, detail.etag);
              setDetail(null);
              void load(weekOffset);
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Delete failed');
            }
          }}
          onClose={() => setDetail(null)}
        />
      )}

      {editing && (
        <EventEditModal
          event={editing === 'new' ? null : editing}
          defaultDate={weekOffset === 0 ? new Date() : selectedDay}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load(weekOffset);
          }}
        />
      )}

      {scheduleAI && (
        <ScheduleAssistantModal
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          members={members}
          onClose={() => setScheduleAI(false)}
          onScheduled={() => {
            setScheduleAI(false);
            void load(weekOffset);
          }}
        />
      )}
    </div>
  );
}

type SchedulePhase = 'input' | 'finding' | 'proposed' | 'noslot' | 'error';

function ScheduleAssistantModal({
  currentUserId,
  currentUserName,
  members,
  onClose,
  onScheduled,
}: {
  currentUserId: string;
  currentUserName: string;
  members: TeamMember[];
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<SchedulePhase>('input');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof parseScheduleRequest>> | null>(null);
  const [slot, setSlot] = useState<{ startISO: string; endISO: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [meeting, setMeeting] = useState<MeetingSettings | null>(null);

  const selfEmail = useMemo(
    () => members.find((m) => m.id === currentUserId)?.email ?? '',
    [members, currentUserId],
  );

  useEffect(() => {
    void fetchMeetingSettings()
      .then(setMeeting)
      .catch(() => {});
  }, []);

  const findTime = useCallback(async () => {
    const request = text.trim();
    if (!request) return;
    setPhase('finding');
    setError(null);
    setWarning(null);
    setSlot(null);
    try {
      const roster: RosterEntry[] = members
        .filter((m) => m.email)
        .map((m) => ({ name: m.displayName, email: m.email }));
      const parsed = await parseScheduleRequest({
        text: request,
        roster,
        selfName: currentUserName,
        selfEmail: selfEmail || 'me@unknown.local',
      });
      setPlan(parsed);

      const emails = [...parsed.attendees.map((a) => a.email), ...(selfEmail ? [selfEmail] : [])];
      let busy: { start: string; end: string }[] = [];
      if (emails.length) {
        try {
          const fb = await fetchFreeBusy(emails, parsed.windowStartISO, parsed.windowEndISO);
          if (!fb.connected) {
            setWarning('Zoho isn’t connected, so availability couldn’t be checked — picking the earliest time in your window.');
          } else if (!fb.freebusyScope) {
            setWarning('Reconnect Zoho to grant availability access; for now I picked the earliest time in your window.');
          } else {
            busy = Object.values(fb.busyByEmail).flat();
          }
        } catch {
          setWarning('Availability lookup failed — picking the earliest time in your window.');
        }
      }

      const found = findCommonSlot({
        windowStartISO: parsed.windowStartISO,
        windowEndISO: parsed.windowEndISO,
        durationMinutes: parsed.durationMinutes,
        busy,
      });
      if (!found) {
        setPhase('noslot');
        return;
      }
      setSlot(found);
      setPhase('proposed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not understand that request.');
      setPhase('error');
    }
  }, [text, members, currentUserName, selfEmail]);

  const schedule = useCallback(async () => {
    if (!plan || !slot) return;
    setCreating(true);
    setError(null);
    try {
      const wantsBridge = plan.includeBridge && hasMeetingSettings(meeting);
      const description = [plan.note, wantsBridge ? stripHtml(meeting?.meetingDescription ?? '') : '']
        .filter(Boolean)
        .join('\n\n');
      await createCalendarEvent({
        title: plan.title,
        start: slot.startISO,
        end: slot.endISO,
        allDay: false,
        attendees: plan.attendees.map((a) => a.email),
        location: wantsBridge ? meeting?.meetingLink ?? null : null,
        meetingUrl: wantsBridge ? meeting?.meetingLink ?? null : null,
        description: description || null,
      });
      onScheduled();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the event.');
      setPhase('error');
      setCreating(false);
    }
  }, [plan, slot, meeting, onScheduled]);

  const slotStart = slot ? new Date(slot.startISO) : null;
  const slotEnd = slot ? new Date(slot.endISO) : null;

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal assist-schedule-modal" role="dialog" aria-label="Schedule for me">
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="sparkles" size={14} /> Schedule for me
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          <label className="assist-schedule-label" htmlFor="assist-schedule-input">
            Describe the meeting in plain language
          </label>
          <textarea
            id="assist-schedule-input"
            className="assist-schedule-input"
            rows={3}
            placeholder="e.g. Find a time Friday morning that Josh, Joe, and I can meet and schedule a 30-min sync with my bridge."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={phase === 'finding' || creating}
          />

          {warning && <div className="assist-schedule-warn">{warning}</div>}
          {error && <div className="assist-schedule-error">{error}</div>}

          {phase === 'finding' && <div className="assist-schedule-status">Finding a time that works…</div>}

          {phase === 'noslot' && plan && (
            <div className="assist-schedule-status">
              No common opening for {plan.attendees.map((a) => a.name).join(', ') || 'everyone'} in that window.
              Try widening the time range.
            </div>
          )}

          {phase === 'proposed' && plan && slotStart && slotEnd && (
            <div className="assist-schedule-proposal">
              <div className="assist-schedule-prop-title">{plan.title}</div>
              <div className="assist-schedule-prop-row">
                <AppIcon name="calendar" size={12} />{' '}
                {slotStart.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} ·{' '}
                {fmtClock(slotStart)} – {fmtClock(slotEnd)}
              </div>
              <div className="assist-schedule-prop-row">
                <AppIcon name="specialist" size={12} />{' '}
                {plan.attendees.length
                  ? plan.attendees.map((a) => a.name).join(', ')
                  : 'No additional attendees'}
              </div>
              {plan.includeBridge && hasMeetingSettings(meeting) && (
                <div className="assist-schedule-prop-row">
                  <AppIcon name="link" size={12} /> Your meeting bridge will be added
                </div>
              )}
            </div>
          )}
        </div>
        <div className="assist-modal-foot">
          {phase === 'proposed' ? (
            <>
              <button type="button" className="assist-mini-btn primary" onClick={() => void schedule()} disabled={creating}>
                <AppIcon name="add" size={11} /> {creating ? 'Scheduling…' : 'Schedule it'}
              </button>
              <button type="button" className="assist-mini-btn" onClick={() => setPhase('input')} disabled={creating}>
                Adjust
              </button>
            </>
          ) : (
            <button
              type="button"
              className="assist-mini-btn primary"
              onClick={() => void findTime()}
              disabled={phase === 'finding' || !text.trim()}
            >
              <AppIcon name="sparkles" size={11} /> {phase === 'finding' ? 'Working…' : 'Find a time'}
            </button>
          )}
          <button type="button" className="assist-mini-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function stripHtml(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? '').trim();
}

// Module-level cache of full attendee lists keyed by event id, so the day view
// enriches participants once and re-renders/day-switches don't refetch.
const fullAttendeeCache = new Map<string, AssistantEventAttendee[]>();

function DayEventCard({
  event,
  recap,
  addedKeys,
  onAddTask,
  onOpen,
  onEmail,
}: {
  event: AssistantCalendarEvent;
  recap: AssistantRecap | null;
  addedKeys: Set<string>;
  onAddTask: (title: string, key: string, meta?: import('@/lib/assistant/task-source').AssistantTaskSourceMeta) => void;
  onOpen: () => void;
  onEmail: () => void;
}) {
  const [showRecap, setShowRecap] = useState(false);
  const [fullAttendees, setFullAttendees] = useState<AssistantEventAttendee[] | null>(
    () => fullAttendeeCache.get(event.id) ?? null,
  );
  const status = eventStatus(event);
  const start = new Date(event.start);
  const end = new Date(event.end);

  // Zoho's list endpoint often returns a trimmed attendee set. The week API
  // enriches events server-side, but fetch detail here as a fallback when it
  // hasn't run yet or failed — cached per event id.
  useEffect(() => {
    if (!event.id) return;
    if (event.attendeesComplete) {
      fullAttendeeCache.set(event.id, event.attendees);
      setFullAttendees(event.attendees);
      return;
    }
    if (fullAttendeeCache.has(event.id)) {
      setFullAttendees(fullAttendeeCache.get(event.id) ?? null);
      return;
    }
    let cancelled = false;
    void fetchCalendarEvent(event.id, event.calendarUid)
      .then((e) => {
        if (!e) return;
        fullAttendeeCache.set(event.id, e.attendees);
        if (!cancelled) setFullAttendees(e.attendees);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [event.id, event.attendeesComplete, event.attendees.length]);

  const attendees = fullAttendees ?? event.attendees;
  return (
    <div className={`assist-meeting${status === 'past' ? ' is-past' : ''}`}>
      <div className="assist-meeting-time">
        {event.allDay ? (
          <span className="assist-meeting-allday">All day</span>
        ) : (
          <>
            <span className="assist-meeting-start">{fmtClock(start)}</span>
            <span className="assist-meeting-end">{fmtClock(end)}</span>
          </>
        )}
      </div>
      <div className="assist-meeting-body">
        <div className="assist-meeting-titlerow">
          <button type="button" className="assist-meeting-title" onClick={onOpen}>
            {event.title}
          </button>
          {status === 'now' && <span className="assist-badge assist-badge--now">In progress</span>}
          {status === 'past' && <span className="assist-badge assist-badge--past">Past</span>}
          {recap && <span className="assist-badge assist-badge--recap">Recap</span>}
        </div>
        {event.location && <div className="assist-meeting-meta">{event.location}</div>}
        {attendees.length > 0 && (
          <div className="assist-meeting-attendees">
            {attendees.slice(0, 6).map((a) => (
              <span
                key={a.email || a.name}
                className={`assist-attendee-chip${a.isOrganizer ? ' is-organizer' : ''}`}
                title={`${a.email || a.name}${a.isOrganizer ? ' · Organizer' : ''} (${a.status})`}
              >
                <span className={`assist-att-dot assist-att-dot--${a.status}`} />
                {a.name}
                {a.isOrganizer && <span className="assist-attendee-tag">Organizer</span>}
              </span>
            ))}
            {attendees.length > 6 && (
              <span className="assist-attendee-chip">+{attendees.length - 6}</span>
            )}
          </div>
        )}
        {recap && showRecap && <RecapBlock recap={recap} addedKeys={addedKeys} onAddTask={onAddTask} embedded />}
      </div>
      <div className="assist-meeting-side">
        {event.conferenceUrl && (
          <a className="assist-mini-btn primary" href={event.conferenceUrl} target="_blank" rel="noreferrer">
            <AppIcon name="link" size={11} /> Join
          </a>
        )}
        {attendees.some((a) => a.email) && (
          <button type="button" className="assist-mini-btn" onClick={onEmail}>
            <AppIcon name="email" size={11} /> Email
          </button>
        )}
        <button type="button" className="assist-mini-btn" onClick={onOpen}>
          <AppIcon name="specialist" size={11} /> Details
        </button>
        {recap && (
          <button type="button" className="assist-mini-btn" onClick={() => setShowRecap((s) => !s)}>
            <AppIcon name="sparkles" size={11} /> {showRecap ? 'Hide recap' : 'Recap'}
            {recap.actionItems.length ? ` · ${recap.actionItems.length}` : ''}
          </button>
        )}
      </div>
    </div>
  );
}

function EventDetailModal({
  event,
  recap,
  addedKeys,
  onAddTask,
  onEmail,
  onEdit,
  onDelete,
  onClose,
}: {
  event: AssistantCalendarEvent;
  recap: AssistantRecap | null;
  addedKeys: Set<string>;
  onAddTask: (title: string, key: string, meta?: import('@/lib/assistant/task-source').AssistantTaskSourceMeta) => void;
  onEmail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  // The week/list endpoint returns a trimmed attendee set (often just you), so
  // pull the full participant list with emails when the detail modal opens.
  const [full, setFull] = useState<AssistantCalendarEvent | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  useEffect(() => {
    if (!event.id) return;
    let cancelled = false;
    setFull(null);
    setAttLoading(true);
    void fetchCalendarEvent(event.id, event.calendarUid)
      .then((e) => {
        if (!cancelled && e) setFull(e);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAttLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);
  const shown = full ?? event;
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal" role="dialog" aria-label="Event details">
        <div className="assist-modal-head">
          <div className="assist-modal-title">{event.title}</div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          <div className="assist-modal-meta">
            <AppIcon name="calendar" size={12} />{' '}
            {start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            {event.allDay ? ' · All day' : ` · ${fmtClock(start)} – ${fmtClock(end)}`}
          </div>
          {(shown.location || event.location) && (
            <div className="assist-modal-meta">
              <AppIcon name="building" size={12} /> {shown.location || event.location}
            </div>
          )}
          {(shown.organizerName || shown.organizer) && (
            <div className="assist-modal-meta">
              <AppIcon name="specialist" size={12} /> Organized by {shown.organizerName || shown.organizer}
            </div>
          )}
          {(shown.conferenceUrl || event.conferenceUrl) && (
            <div className="assist-modal-meta">
              <AppIcon name="link" size={12} />{' '}
              <a href={shown.conferenceUrl || event.conferenceUrl || undefined} target="_blank" rel="noreferrer">
                Join meeting
              </a>
            </div>
          )}
          {(() => {
            const recapUrl =
              recap?.recapUrl ?? shown.dialpadRecapUrl ?? event.dialpadRecapUrl ?? null;
            const desc = stripDialpadRecapLinkText(
              shown.description || event.description || '',
              recapUrl,
            );
            if (!desc && !recapUrl) return null;
            return (
              <div className="assist-modal-desc">
                {recapUrl && <RecapOpenLink url={recapUrl} className="assist-recap-open--block" />}
                {desc ? <span>{desc}</span> : null}
              </div>
            );
          })()}

          {(shown.attendees.length > 0 || attLoading) && (
            <div className="assist-modal-section">
              <div className="assist-modal-label">
                Participants ({shown.attendees.length})
                {attLoading && <span className="assist-att-loading"> · loading…</span>}
              </div>
              <div className="assist-attendees">
                {shown.attendees.map((a) => (
                  <div key={a.email || a.name} className="assist-attendee">
                    <span className={`assist-att-dot assist-att-dot--${a.status}`} />
                    <span className="assist-att-name">{a.name}</span>
                    {a.isOrganizer && <span className="assist-attendee-tag">Organizer</span>}
                    {a.email && <span className="assist-att-email">{a.email}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {recap && (
            <div className="assist-modal-section">
              <div className="assist-modal-label">
                <AppIcon name="sparkles" size={11} /> Call recap
              </div>
              <RecapBlock recap={recap} addedKeys={addedKeys} onAddTask={onAddTask} embedded />
            </div>
          )}
        </div>
        <div className="assist-modal-foot">
          {event.attendees.some((a) => a.email) && (
            <button type="button" className="assist-mini-btn primary" onClick={onEmail}>
              <AppIcon name="email" size={11} /> Email attendees
            </button>
          )}
          <button type="button" className="assist-mini-btn" onClick={onEdit}>
            <AppIcon name="settings" size={11} /> Edit
          </button>
          <button type="button" className="assist-mini-btn danger" onClick={onDelete}>
            <AppIcon name="close" size={11} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventEditModal({
  event,
  defaultDate,
  prefill,
  onClose,
  onSaved,
}: {
  event: AssistantCalendarEvent | null;
  defaultDate: Date;
  prefill?: { title?: string; attendees?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const initStart = event ? new Date(event.start) : (() => {
    const d = new Date(defaultDate);
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  })();
  const initEnd = event ? new Date(event.end) : new Date(initStart.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(event?.title ?? prefill?.title ?? '');
  const [date, setDate] = useState(toDateInput(initStart));
  const [startTime, setStartTime] = useState(toTimeInput(initStart));
  const [endTime, setEndTime] = useState(toTimeInput(initEnd));
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [meetingUrl, setMeetingUrl] = useState(event?.conferenceUrl ?? '');
  const [attendees, setAttendees] = useState(
    event ? event.attendees.map((a) => a.email).filter(Boolean).join(', ') : prefill?.attendees ?? '',
  );
  const [meetingSettings, setMeetingSettings] = useState<MeetingSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMeetingSettings()
      .then((s) => {
        if (!cancelled) setMeetingSettings(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const insertConference = () => {
    const s = meetingSettings;
    if (!s) return;
    const link = s.meetingLink.trim();
    if (link) {
      setMeetingUrl(link);
      setLocation((prev) => (prev.trim() ? (prev.includes(link) ? prev : `${prev} · ${link}`) : link));
    }
    const desc = s.meetingDescription.trim();
    if (desc) {
      setDescription((prev) => (prev.trim() ? `${prev}<br/><br/>${desc}` : desc));
    }
  };

  const save = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setBusy(true);
    setError(null);
    const startIso = new Date(`${date}T${allDay ? '00:00' : startTime}`).toISOString();
    const endIso = new Date(`${date}T${allDay ? '23:59' : endTime}`).toISOString();
    const payload: CalendarEventInput = {
      title: title.trim(),
      start: startIso,
      end: endIso,
      allDay,
      location: location.trim() || null,
      description: description.trim() || null,
      meetingUrl: meetingUrl.trim() || null,
      attendees: attendees
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      if (event) {
        await updateCalendarEvent(event.id, { ...payload, etag: event.etag });
      } else {
        await createCalendarEvent(payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal" role="dialog" aria-label="Edit event">
        <div className="assist-modal-head">
          <div className="assist-modal-title">{event ? 'Edit event' : 'New event'}</div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body assist-form">
          <label className="assist-field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title" />
          </label>
          <label className="assist-field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {!allDay && (
            <div className="assist-field-row">
              <label className="assist-field">
                <span>Start</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <label className="assist-field">
                <span>End</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
            </div>
          )}
          <label className="assist-field assist-field--check">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <span>All day</span>
          </label>
          <label className="assist-field">
            <span>Meeting URL</span>
            <input
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meetings.dialpad.com/…"
            />
          </label>
          {hasMeetingSettings(meetingSettings) && (
            <button type="button" className="assist-mini-btn assist-insert-conf" onClick={insertConference}>
              <AppIcon name="link" size={11} /> Insert conference
            </button>
          )}
          <label className="assist-field">
            <span>Location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
          </label>
          <label className="assist-field">
            <span>Attendees (comma-separated emails)</span>
            <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="name@company.com, …" />
          </label>
          <div className="assist-field">
            <span>Description</span>
            <RichTextField
              value={description}
              onChange={setDescription}
              uploadUrl={MEETING_ATTACHMENT_UPLOAD_URL}
              placeholder="Optional"
              minHeight={90}
            />
          </div>
          {error && <div className="assist-form-error">{error}</div>}
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="assist-mini-btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : event ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RECIPIENT CHIP FIELD (with portal-contact autocomplete) ────────
type Recipient = { email: string; name?: string };

function parseRecipients(raw: string): Recipient[] {
  return splitEmails(raw).map((email) => ({ email }));
}

const CONTACT_TYPE_LABEL: Record<PortalContact['type'], string> = {
  account: 'Account',
  supplier: 'Supplier',
  team: 'Candid',
};

function RecipientField({
  label,
  recipients,
  onChange,
  autoFocus,
}: {
  label: string;
  recipients: Recipient[];
  onChange: (next: Recipient[]) => void;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<PortalContact[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const q = input.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await searchPortalContacts(q);
      if (cancelled) return;
      const have = new Set(recipients.map((r) => r.email.toLowerCase()));
      const filtered = res.filter((c) => !have.has(c.email.toLowerCase())).slice(0, 8);
      setSuggestions(filtered);
      setOpen(filtered.length > 0);
      setActive(0);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input, recipients]);

  const addRecipient = (r: Recipient) => {
    const email = r.email.trim();
    if (!email) return;
    if (!recipients.some((x) => x.email.toLowerCase() === email.toLowerCase())) {
      onChange([...recipients, { email, name: r.name }]);
    }
    setInput('');
    setSuggestions([]);
    setOpen(false);
  };

  const commitText = () => {
    const v = input.trim().replace(/[,;]+$/, '').trim();
    if (!v) return;
    const email = emailAddr(v);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) addRecipient({ email });
  };

  const removeAt = (i: number) => onChange(recipients.filter((_, idx) => idx !== i));

  return (
    <div className="assist-recip-field">
      <span className="assist-recip-label">{label}</span>
      <div className="assist-recip-box" onClick={() => inputRef.current?.focus()}>
        {recipients.map((r, i) => (
          <span key={`${r.email}-${i}`} className="assist-recip-chip" title={r.email}>
            {r.name ? `${r.name} · ${r.email}` : r.email}
            <button
              type="button"
              className="assist-recip-chip-x"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(i);
              }}
              aria-label={`Remove ${r.email}`}
            >
              <AppIcon name="close" size={9} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
              if (open && suggestions[active]) {
                e.preventDefault();
                const c = suggestions[active];
                addRecipient({ email: c.email, name: c.name });
              } else if (input.trim()) {
                e.preventDefault();
                commitText();
              }
            } else if (e.key === 'Backspace' && !input && recipients.length) {
              removeAt(recipients.length - 1);
            } else if (e.key === 'ArrowDown' && open) {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp' && open) {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          onBlur={() => {
            commitText();
            setTimeout(() => setOpen(false), 120);
          }}
          placeholder={recipients.length ? '' : 'Add people — search portal contacts…'}
        />
        {open && (
          <ul className="assist-recip-menu" role="listbox">
            {suggestions.map((c, i) => (
              <li
                key={c.email}
                role="option"
                aria-selected={i === active}
                className={`assist-recip-opt${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addRecipient({ email: c.email, name: c.name });
                }}
              >
                <span className="assist-recip-opt-main">
                  <span className="assist-recip-opt-name">{c.name}</span>
                  <span className="assist-recip-opt-email">{c.email}</span>
                </span>
                <span className="assist-recip-opt-meta">
                  {c.org ? <span className="assist-recip-opt-org">{c.org}</span> : null}
                  <span className={`assist-recip-opt-type t-${c.type}`}>
                    {CONTACT_TYPE_LABEL[c.type]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── AI COMPOSE / REPLY ─────────────────────────────────────────────
function ComposeModal({
  target,
  queueRemaining,
  currentUserName,
  mailbox,
  onClose,
  onSent,
}: {
  target: ComposeTarget;
  queueRemaining: number;
  currentUserName: string;
  mailbox: string;
  onClose: () => void;
  onSent: (handled: boolean) => void;
}) {
  const isNew = target.mode === 'new';
  const [toRecipients, setToRecipients] = useState<Recipient[]>(() => parseRecipients(target.to));
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>(() =>
    parseRecipients(target.cc ?? ''),
  );
  const [bccRecipients, setBccRecipients] = useState<Recipient[]>([]);
  const [showCc, setShowCc] = useState<boolean>(() => parseRecipients(target.cc ?? '').length > 0);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(target.subject);
  const [bodyHtml, setBodyHtml] = useState('');
  const [hint, setHint] = useState('');
  const [knowledge, setKnowledge] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [originalLoading, setOriginalLoading] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);

  // Reset all fields when the modal is reused for the next queued reply.
  useEffect(() => {
    setToRecipients(parseRecipients(target.to));
    const cc = parseRecipients(target.cc ?? '');
    setCcRecipients(cc);
    setShowCc(cc.length > 0);
    setBccRecipients([]);
    setShowBcc(false);
    setSubject(target.subject);
    setBodyHtml('');
    setKnowledge([]);
    setError(null);
    setShowOriginal(true);
  }, [target]);

  // Load the message being replied to so the user can see the thread/history.
  useEffect(() => {
    if (isNew || !target.messageId || !target.folderId) {
      setOriginal(null);
      return;
    }
    let cancelled = false;
    setOriginalLoading(true);
    setOriginal(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/email/conversation?email=${encodeURIComponent(target.lookupEmail)}&messageId=${encodeURIComponent(target.messageId!)}&folderId=${encodeURIComponent(target.folderId!)}`,
        );
        const json = (await res.json()) as { content?: string };
        if (!cancelled) {
          setOriginal(typeof json.content === 'string' && json.content.trim() ? json.content : '(No content available.)');
        }
      } catch {
        if (!cancelled) setOriginal('(Could not load the original message.)');
      } finally {
        if (!cancelled) setOriginalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, isNew]);

  const joinEmails = (list: Recipient[]) =>
    Array.from(new Set(list.map((r) => r.email.trim()).filter(Boolean))).join(', ');

  const generate = useCallback(
    async (h?: string) => {
      const to = joinEmails(toRecipients);
      if (isNew && !to) {
        setError('Add at least one recipient before drafting');
        return;
      }
      setDrafting(true);
      setError(null);
      try {
        const lookup = isNew ? to.split(',')[0]?.trim() || to : target.lookupEmail;
        const res = await fetchReplyDraft({
          mode: isNew ? 'new' : 'reply',
          messageId: target.messageId,
          folderId: target.folderId,
          from: lookup,
          to: isNew ? to : undefined,
          subject: subject.trim() || target.subject,
          hint: h,
        });
        setBodyHtml(draftPlainToHtml(res.draft));
        if (res.subject && isNew) setSubject(res.subject);
        setKnowledge(res.knowledge);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Draft failed');
      } finally {
        setDrafting(false);
      }
    },
    [target, isNew, toRecipients, subject],
  );

  useEffect(() => {
    if (isNew) return;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, isNew]);

  const send = async () => {
    const to = joinEmails(toRecipients);
    const plain = plainFromHtml(bodyHtml);
    if (!to || !plain) {
      setError('At least one recipient and a message are required');
      return;
    }
    // Guard against accidentally emailing our own mailbox on reply-all.
    const cc = joinEmails(ccRecipients.filter((r) => r.email.toLowerCase() !== mailbox.toLowerCase()));
    const bcc = joinEmails(bccRecipients);
    setSending(true);
    setError(null);
    try {
      await sendEmailReply({
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject: subject.trim() || '(no subject)',
        text: plain,
        html: bodyHtml.trim() || undefined,
      });
      // Zero-inbox: treat as handled unless the reply explicitly defers ("I'll follow up").
      const handled = !isNew && !/follow[\s-]?up|circle back|get back to you/i.test(plain);
      onSent(handled);
      setSent(true);
      setTimeout(onClose, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal assist-compose" role="dialog" aria-label={isNew ? 'Compose email' : 'Compose reply'}>
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name={isNew ? 'email' : 'sparkles'} size={14} />{' '}
            {isNew ? 'New email' : 'AI reply'}
            {target.contextLabel && !isNew ? ` · ${target.contextLabel}` : ''}
            {queueRemaining > 0 && <span className="assist-queue-pill">{queueRemaining} more queued</span>}
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          {(target.messageId && target.folderId && !isNew) && (
            <div className="assist-compose-original">
              <button
                type="button"
                className="assist-compose-original-head"
                onClick={() => setShowOriginal((v) => !v)}
              >
                <AppIcon name={showOriginal ? 'eye' : 'eyeOff'} size={12} />
                <span>Replying to</span>
                <span className="assist-compose-original-from">{target.contextLabel || target.lookupEmail}</span>
                <span className="assist-compose-original-toggle">{showOriginal ? 'Hide' : 'Show'}</span>
              </button>
              {showOriginal && (
                <div className="assist-compose-original-body">
                  {originalLoading ? (
                    <div className="assist-brief-loading">
                      <span className="assist-spinner" /> Loading original message…
                    </div>
                  ) : (
                    <div
                      className="assist-emailview-html"
                      dangerouslySetInnerHTML={{ __html: original ?? '' }}
                    />
                  )}
                </div>
              )}
            </div>
          )}
          {knowledge.length > 0 && (
            <div className="assist-compose-knows">
              <span className="assist-compose-knows-label">Hank knows:</span>
              {knowledge.slice(0, 4).map((k, i) => (
                <span key={i} className="assist-know-chip">
                  {k}
                </span>
              ))}
            </div>
          )}
          <div className="assist-recip-row">
            <RecipientField label="To" recipients={toRecipients} onChange={setToRecipients} />
            <div className="assist-recip-toggles">
              {!showCc && (
                <button type="button" className="assist-recip-toggle" onClick={() => setShowCc(true)}>
                  Cc
                </button>
              )}
              {!showBcc && (
                <button type="button" className="assist-recip-toggle" onClick={() => setShowBcc(true)}>
                  Bcc
                </button>
              )}
            </div>
          </div>
          {showCc && (
            <RecipientField label="Cc" recipients={ccRecipients} onChange={setCcRecipients} autoFocus />
          )}
          {showBcc && (
            <RecipientField label="Bcc" recipients={bccRecipients} onChange={setBccRecipients} autoFocus />
          )}
          <label className="assist-field">
            <span>Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <div className="assist-compose-body">
            {drafting ? (
              <div className="assist-brief-loading">
                <span className="assist-spinner" />{' '}
                {isNew
                  ? 'Drafting your message from portal knowledge…'
                  : 'Drafting a reply from your history & portal knowledge…'}
              </div>
            ) : (
              <RichTextField
                value={bodyHtml}
                onChange={setBodyHtml}
                placeholder={isNew ? 'Write your message…' : 'Write your reply…'}
                minHeight={220}
              />
            )}
          </div>
          <div className="assist-compose-redraft">
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={
                isNew
                  ? 'Tell Hank what to write (e.g. follow up on quote, invite to a call)…'
                  : 'Tell Hank how to adjust (e.g. shorter, offer a call Tuesday)…'
              }
              onKeyDown={(e) => e.key === 'Enter' && void generate(hint)}
              disabled={drafting}
            />
            <button type="button" className="assist-mini-btn primary" onClick={() => void generate(hint)} disabled={drafting}>
              <AppIcon name="sparkles" size={11} className={drafting ? 'spin' : undefined} />{' '}
              {isNew && !bodyHtml ? 'Draft with AI' : 'Redraft'}
            </button>
          </div>
          {!isNew && (
            <p className="assist-compose-note">
              Sending marks this handled and clears it. Mention &ldquo;I&rsquo;ll follow up&rdquo; to keep it open.
            </p>
          )}
          {error && <div className="assist-form-error">{error}</div>}
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose} disabled={sending}>
            {queueRemaining > 0 ? 'Skip' : 'Cancel'}
          </button>
          <button type="button" className="assist-mini-btn primary" onClick={() => void send()} disabled={sending || drafting || sent}>
            <AppIcon name="send" size={11} /> {sent ? 'Sent ✓' : sending ? 'Sending…' : queueRemaining > 0 ? 'Send & next' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FULL EMAIL VIEWER ──────────────────────────────────────────────
function ViewEmailModal({
  item,
  onClose,
  onReply,
}: {
  item: AssistantOverview['email']['inbox'][number];
  onClose: () => void;
  onReply: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/email/conversation?email=${encodeURIComponent(item.fromAddress || emailAddr(item.from))}&messageId=${encodeURIComponent(item.id)}&folderId=${encodeURIComponent(item.folderId)}`,
        );
        const json = (await res.json()) as { content?: string };
        if (!cancelled) setContent(typeof json.content === 'string' ? json.content : '(No content available.)');
      } catch {
        if (!cancelled) setError('Could not load this message.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item]);

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal assist-emailview" role="dialog" aria-label="Email">
        <div className="assist-modal-head">
          <div className="assist-modal-title">{item.subject || '(no subject)'}</div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          <div className="assist-modal-meta">
            <AppIcon name="email" size={12} /> {item.from}
            <span style={{ marginLeft: 'auto', color: 'var(--gray)' }}>{relativeTime(new Date(item.receivedTime).toISOString())}</span>
          </div>
          {item.to.trim() && (
            <div className="assist-emailview-recips"><span>To</span> {item.to}</div>
          )}
          {item.cc.trim() && (
            <div className="assist-emailview-recips"><span>Cc</span> {item.cc}</div>
          )}
          <div className="assist-emailview-content">
            {loading && (
              <div className="assist-brief-loading">
                <span className="assist-spinner" /> Loading message…
              </div>
            )}
            {error && <p className="assist-empty">{error}</p>}
            {!loading && !error && (
              <div className="assist-emailview-html" dangerouslySetInnerHTML={{ __html: content ?? '' }} />
            )}
          </div>
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="assist-mini-btn primary" onClick={onReply}>
            <AppIcon name="email" size={11} /> Reply with AI
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DIALPAD API DIAGNOSTIC ───────────────────────────────────────────
function DialpadDiagModal({ diag, onClose }: { diag: DialpadDiagnostics; onClose: () => void }) {
  const cw = diag.companyWide;
  const pu = diag.perUserProbe;
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal assist-dialpad-diag" role="dialog" aria-label="Dialpad diagnostic">
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="bolt" size={14} /> Dialpad connection test
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          {diag.error && <p className="assist-form-error">{diag.error}</p>}
          {diag.hint && <p className="assist-empty">{diag.hint}</p>}
          {diag.configured === false && (
            <p className="assist-empty">DIALPAD_API_KEY is not set on this server (Vercel env vars).</p>
          )}
          {diag.configured && (
            <div className="assist-diag-grid">
              <div className="assist-diag-row">
                <span>Company-wide list</span>
                <strong>
                  {cw ? `HTTP ${cw.status} · ${cw.count} call(s)` : '—'}
                  {cw?.error ? ` — ${cw.error.slice(0, 120)}` : ''}
                </strong>
              </div>
              <div className="assist-diag-row">
                <span>Dialpad users found</span>
                <strong>{diag.usersFound ?? 0}</strong>
              </div>
              {diag.usersError && (
                <div className="assist-diag-row">
                  <span>Users API</span>
                  <strong className="assist-form-error">{diag.usersError}</strong>
                </div>
              )}
              <div className="assist-diag-row">
                <span>Per-user probe (first user)</span>
                <strong>
                  {pu ? `HTTP ${pu.status} · ${pu.count} call(s)` : '—'}
                  {pu?.error ? ` — ${pu.error.slice(0, 120)}` : ''}
                </strong>
              </div>
              {diag.sampleUsers && diag.sampleUsers.length > 0 && (
                <div className="assist-diag-row assist-diag-row--stack">
                  <span>Sample users</span>
                  <ul className="assist-diag-users">
                    {diag.sampleUsers.map((u) => (
                      <li key={u.id}>
                        {u.name ?? 'Unnamed'} <code>{u.id}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <p className="assist-contact-note" style={{ marginTop: 12 }}>
            Only <strong>completed</strong> calls appear in Dialpad&apos;s API. Self-calls often don&apos;t log.
            Try an external call, hang up, wait ~1 min, then Sync. Use <strong>Team</strong> if the call was on
            another line.
          </p>
          <details className="assist-diag-raw">
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(diag, null, 2)}</pre>
          </details>
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CONTACT DETAILS + CONVERSATION HISTORY ─────────────────────────
const CONTACT_DETAIL_TYPE_LABEL: Record<NonNullable<ContactDetail['type']>, string> = {
  account: 'Account',
  supplier: 'Supplier',
  team: 'Team',
};

function formatConvWhen(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ContactDetailModal({
  email,
  fallbackName,
  onClose,
  onEmail,
  onOpenCustomer,
}: {
  email: string;
  fallbackName: string;
  onClose: () => void;
  onEmail: () => void;
  onOpenCustomer?: (customerId: string) => void;
}) {
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contentById, setContentById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const d = await fetchContactDetail(email);
        if (!cancelled) setDetail(d);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  useEffect(() => {
    let cancelled = false;
    setConvLoading(true);
    setConvError(null);
    void (async () => {
      try {
        const res = await fetchCustomerConversation(email);
        if (!cancelled) {
          if (!res.connected) setConvError('Connect your Zoho mailbox to see conversation history.');
          setMessages(res.messages);
        }
      } catch {
        if (!cancelled) setConvError('Could not load conversation history.');
      } finally {
        if (!cancelled) setConvLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const toggleMessage = async (m: ConversationMessage) => {
    if (expandedId === m.messageId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(m.messageId);
    if (contentById[m.messageId] == null) {
      try {
        const content = await fetchMessageContent(email, m.messageId, m.folderId);
        setContentById((prev) => ({ ...prev, [m.messageId]: content || '(No content available.)' }));
      } catch {
        setContentById((prev) => ({ ...prev, [m.messageId]: '<em>Could not load message.</em>' }));
      }
    }
  };

  const name = detail?.name || fallbackName || email;
  const org = detail?.org;
  const phone = detail?.phone;

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal assist-contact" role="dialog" aria-label="Contact">
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="specialist" size={14} /> {name}
            {detail?.type && (
              <span className={`assist-contact-type assist-contact-type--${detail.type}`}>
                {CONTACT_DETAIL_TYPE_LABEL[detail.type]}
              </span>
            )}
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          <div className="assist-contact-card">
            {detailLoading ? (
              <div className="assist-brief-loading">
                <span className="assist-spinner" /> Loading contact…
              </div>
            ) : (
              <>
                <div className="assist-contact-grid">
                  {org && (
                    <div className="assist-contact-field">
                      <span>{detail?.type === 'supplier' ? 'Supplier' : 'Company'}</span>
                      {detail?.customerId && onOpenCustomer ? (
                        <button
                          type="button"
                          className="assist-customer-link"
                          onClick={() => onOpenCustomer(detail.customerId!)}
                        >
                          {org}
                        </button>
                      ) : (
                        <strong>{org}</strong>
                      )}
                    </div>
                  )}
                  {detail?.role && (
                    <div className="assist-contact-field">
                      <span>Role</span>
                      <strong>{detail.role}</strong>
                    </div>
                  )}
                  {detail?.agent && (
                    <div className="assist-contact-field">
                      <span>Agent</span>
                      <strong>{detail.agent}</strong>
                    </div>
                  )}
                  {detail?.status && (
                    <div className="assist-contact-field">
                      <span>Status</span>
                      <strong style={{ textTransform: 'capitalize' }}>{detail.status}</strong>
                    </div>
                  )}
                  {detail?.category && (
                    <div className="assist-contact-field">
                      <span>Category</span>
                      <strong>{detail.category}</strong>
                    </div>
                  )}
                  <div className="assist-contact-field">
                    <span>Email</span>
                    <button
                      type="button"
                      className="assist-customer-link"
                      onClick={onEmail}
                    >
                      {email}
                    </button>
                  </div>
                  {phone && (
                    <div className="assist-contact-field">
                      <span>Phone</span>
                      <a href={`tel:${phone}`}>{phone}</a>
                    </div>
                  )}
                  {detail?.website && (
                    <div className="assist-contact-field">
                      <span>Website</span>
                      <a href={detail.website} target="_blank" rel="noopener noreferrer">
                        {detail.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  )}
                </div>
                {!detail?.found && (
                  <p className="assist-contact-note">Not in the portal yet — showing email history only.</p>
                )}
                <div className="assist-contact-actions">
                  <button type="button" className="assist-mini-btn primary" onClick={onEmail}>
                    <AppIcon name="email" size={11} /> Email
                  </button>
                  {phone && (
                    <a className="assist-mini-btn" href={`tel:${phone}`}>
                      <AppIcon name="phone" size={11} /> Call
                    </a>
                  )}
                  {detail?.customerId && onOpenCustomer && (
                    <button
                      type="button"
                      className="assist-mini-btn"
                      onClick={() => onOpenCustomer(detail.customerId!)}
                    >
                      <AppIcon name="building" size={11} /> Open account
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="assist-contact-history">
            <div className="assist-contact-history-head">Conversation history</div>
            {convLoading ? (
              <div className="assist-brief-loading">
                <span className="assist-spinner" /> Loading conversation…
              </div>
            ) : convError ? (
              <p className="assist-empty">{convError}</p>
            ) : messages.length === 0 ? (
              <p className="assist-empty">No email found with {email}.</p>
            ) : (
              <ul className="assist-conv-list">
                {messages.map((m) => {
                  const inbound = m.fromAddress.toLowerCase() === email.toLowerCase();
                  const expanded = expandedId === m.messageId;
                  return (
                    <li key={m.messageId} className={`assist-conv-item${expanded ? ' expanded' : ''}`}>
                      <button
                        type="button"
                        className="assist-conv-row"
                        onClick={() => void toggleMessage(m)}
                      >
                        <span className={`assist-conv-dir assist-conv-dir--${inbound ? 'in' : 'out'}`}>
                          {inbound ? 'In' : 'Out'}
                        </span>
                        <span className="assist-conv-meta">
                          <span className="assist-conv-subject">{m.subject || '(no subject)'}</span>
                          <span className="assist-conv-sender">{m.sender || m.fromAddress}</span>
                        </span>
                        <span className="assist-conv-time">
                          {formatConvWhen(m.receivedTime || m.sentTime)}
                        </span>
                      </button>
                      {expanded ? (
                        <div className="assist-conv-body">
                          {contentById[m.messageId] != null ? (
                            <div
                              className="assist-emailview-html"
                              dangerouslySetInnerHTML={{ __html: contentById[m.messageId]! }}
                            />
                          ) : (
                            <div className="assist-conv-loading">Loading message…</div>
                          )}
                        </div>
                      ) : (
                        m.summary && <div className="assist-conv-summary">{m.summary}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="assist-mini-btn primary" onClick={onEmail}>
            <AppIcon name="email" size={11} /> Email
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCallDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function isVoicemailCall(call: AssistantCall): boolean {
  const s = (call.state ?? '').toLowerCase();
  if (/voicemail/.test(s)) return true;
  if (
    call.direction === 'inbound' &&
    (call.durationSeconds ?? 0) === 0 &&
    /missed|no.?answer|abandon|unanswered/.test(s)
  ) {
    return true;
  }
  return false;
}

type CommFeedItem =
  | { kind: 'call'; id: string; at: number; call: AssistantCall }
  | { kind: 'message'; id: string; at: number; recap: AssistantRecap };

function CommRecentRow({
  item,
  onOpenCustomer,
  onEmail,
  onAddTask,
  added,
}: {
  item: CommFeedItem;
  onOpenCustomer?: (customerId: string) => void;
  onEmail: (email: string, name?: string) => void;
  onAddTask: (title: string, key: string, meta?: import('@/lib/assistant/task-source').AssistantTaskSourceMeta) => void;
  added: boolean;
}) {
  if (item.kind === 'call') {
    const c = item.call;
    const voicemail = isVoicemailCall(c);
    return (
      <div className="assist-comm-recent">
        <span className={`assist-comm-type assist-comm-type--${voicemail ? 'voicemail' : 'call'}`}>
          <AppIcon name={voicemail ? 'broadcast' : 'phone'} size={12} />
        </span>
        <div className="assist-comm-recent-body">
          <CallRow
            call={c}
            onOpenCustomer={onOpenCustomer}
            onEmail={onEmail}
            onAddTask={onAddTask}
            added={added}
            compact
          />
        </div>
      </div>
    );
  }
  const r = item.recap;
  return (
    <div className="assist-comm-recent">
      <span className="assist-comm-type assist-comm-type--message">
        <AppIcon name="messages" size={12} />
      </span>
      <div className="assist-comm-recent-body">
        <div className="assist-recap-title">{r.title}</div>
        {r.recapUrl && <RecapOpenLink url={r.recapUrl} className="assist-recap-open--block" />}
        {r.summary && (
          <div className="assist-recap-summary">{stripDialpadRecapLinkText(r.summary, r.recapUrl)}</div>
        )}
        <div className="assist-comm-recent-meta">{relativeTime(new Date(r.receivedTime).toISOString())}</div>
        <div className="assist-triage-actions">
          {emailAddr(r.from) && (
            <button type="button" className="assist-mini-btn primary" onClick={() => onEmail(emailAddr(r.from), r.title)}>
              <AppIcon name="email" size={11} /> Email
            </button>
          )}
          <button
            type="button"
            className={`assist-mini-btn${added ? ' added' : ''}`}
            onClick={() => onAddTask(`Follow up: ${r.title}`, `recap:${r.id}`, sourceMetaFromRecap(r))}
            disabled={added}
          >
            <AppIcon name={added ? 'check' : 'add'} size={11} /> Task
          </button>
        </div>
      </div>
    </div>
  );
}

function CallRow({
  call,
  onOpenCustomer,
  onEmail,
  onAddTask,
  added,
  compact,
}: {
  call: AssistantCall;
  onOpenCustomer?: (customerId: string) => void;
  onEmail: (email: string, name?: string) => void;
  onAddTask: (title: string, key: string, meta?: import('@/lib/assistant/task-source').AssistantTaskSourceMeta) => void;
  added: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const name = call.contactName || call.contactPhone || 'Unknown caller';
  const duration = formatCallDuration(call.durationSeconds);
  const hasDetail = Boolean(call.recapSummary || call.transcriptText);
  const dirLabel = call.direction === 'inbound' ? 'Inbound' : call.direction === 'outbound' ? 'Outbound' : 'Call';

  return (
    <div className={`assist-call${compact ? ' assist-call--compact' : ''}`}>
      <div className="assist-call-main">
        {!compact && (
          <span className={`assist-call-dir assist-call-dir--${call.direction}`}>
            <AppIcon name="phone" size={12} />
          </span>
        )}
        <div className="assist-call-body">
          <div className="assist-call-title">
            {call.customerId && onOpenCustomer ? (
              <button
                type="button"
                className="assist-customer-link"
                onClick={() => onOpenCustomer(call.customerId!)}
              >
                {name}
              </button>
            ) : (
              name
            )}
            {call.agentName ? <span className="assist-call-agent"> · {call.agentName}</span> : null}
          </div>
          <div className="assist-call-sub">
            {dirLabel}
            {duration ? ` · ${duration}` : ''}
            {call.state ? ` · ${call.state}` : ''}
            {call.startedAt ? ` · ${relativeTime(call.startedAt)}` : ''}
          </div>
        </div>
        <div className="assist-call-actions">
          {call.contactPhone && (
            <a className="assist-icon-btn" href={`tel:${call.contactPhone}`} title="Call back">
              <AppIcon name="phone" size={12} />
            </a>
          )}
          {call.contactEmail && (
            <button
              type="button"
              className="assist-icon-btn"
              title="Email contact"
              onClick={() => onEmail(call.contactEmail!, call.contactName ?? undefined)}
            >
              <AppIcon name="email" size={12} />
            </button>
          )}
          {call.recordingUrl && (
            <a
              className="assist-icon-btn"
              href={call.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open recording"
            >
              <AppIcon name="broadcast" size={12} />
            </a>
          )}
          {hasDetail && (
            <button
              type="button"
              className="assist-mini-btn"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Hide' : 'Recap'}
            </button>
          )}
        </div>
      </div>
      {open && hasDetail && (
        <div className="assist-call-detail">
          {call.recapSummary && <p className="assist-call-recap">{call.recapSummary}</p>}
          {!call.recapSummary && call.transcriptText && (
            <p className="assist-call-recap">{call.transcriptText.slice(0, 600)}</p>
          )}
          <button
            type="button"
            className="assist-mini-btn"
            disabled={added}
            onClick={() => onAddTask(`Follow up: ${name}`, `call:${call.id}`, sourceMetaFromCall(call))}
          >
            <AppIcon name="check" size={11} /> {added ? 'Added' : 'Add follow-up task'}
          </button>
        </div>
      )}
    </div>
  );
}

function RecapOpenLink({ url, className }: { url: string; className?: string }) {
  return (
    <a
      className={`assist-recap-open${className ? ` ${className}` : ''}`}
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      <AppIcon name="link" size={11} /> View AI Recap
    </a>
  );
}

function RecapBlock({
  recap,
  addedKeys,
  onAddTask,
  embedded,
  onEmail,
}: {
  recap: AssistantRecap;
  addedKeys: Set<string>;
  onAddTask: (title: string, key: string, meta?: import('@/lib/assistant/task-source').AssistantTaskSourceMeta) => void;
  embedded?: boolean;
  onEmail?: () => void;
}) {
  return (
    <div className={`assist-recap${embedded ? ' assist-recap--embedded' : ''}`}>
      {!embedded && <div className="assist-recap-title">{recap.title}</div>}
      {recap.recapUrl && <RecapOpenLink url={recap.recapUrl} className="assist-recap-open--block" />}
      {recap.summary && (
        <div className="assist-recap-summary">
          {stripDialpadRecapLinkText(recap.summary, recap.recapUrl)}
        </div>
      )}
      {!embedded && onEmail && (
        <div className="assist-triage-actions">
          <button type="button" className="assist-mini-btn primary" onClick={onEmail}>
            <AppIcon name="email" size={11} /> Email
          </button>
        </div>
      )}
      {recap.actionItems.length > 0 && (
        <div className="assist-recap-actions">
          <div className="assist-recap-actions-label">Action items</div>
          {recap.actionItems.map((a, i) => {
            const key = `recap:${recap.id}:${i}`;
            return (
              <div key={i} className="assist-recap-item">
                <span className="assist-recap-num">{i + 1}</span>
                <span className="assist-recap-text">{a}</span>
                <button
                  type="button"
                  className={`assist-recap-add${addedKeys.has(key) ? ' added' : ''}`}
                  onClick={() => onAddTask(a, key, sourceMetaFromRecap(recap))}
                  disabled={addedKeys.has(key)}
                >
                  <AppIcon name={addedKeys.has(key) ? 'check' : 'add'} size={10} />
                  {addedKeys.has(key) ? 'Added' : 'Task'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConnectPrompt({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div className="assist-connect">
      <div className="assist-connect-icon">
        <AppIcon name="link" size={18} />
      </div>
      <div className="assist-connect-body">
        <div className="assist-connect-title">{title}</div>
        <div className="assist-connect-sub">{body}</div>
      </div>
      <a className="assist-connect-btn" href="/api/zoho/oauth/start">
        {cta}
      </a>
    </div>
  );
}

/**
 * Per-task assignee control. Shows the current owner and opens a checkbox panel
 * to pick one or more teammates. Applying keeps this task with one owner and
 * fans out a copy to each additional person (matching task-creation behavior).
 */
function AssigneePicker({
  ownerId,
  ownerName,
  members,
  currentUserId,
  onApply,
}: {
  ownerId: string;
  ownerName: string;
  members: TeamMember[];
  currentUserId: string;
  onApply: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set([ownerId]));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSel(new Set([ownerId]));
  }, [ownerId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const nameFor = (id: string) =>
    id === currentUserId ? 'Me' : members.find((m) => m.id === id)?.displayName ?? ownerName;
  const extra = sel.size - 1;
  const label = `${nameFor(ownerId)}${extra > 0 ? ` +${extra}` : ''}`;

  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const apply = () => {
    onApply([...sel]);
    setOpen(false);
  };

  const ownerKnown = members.some((m) => m.id === ownerId);

  return (
    <div className="assist-assign" ref={ref}>
      <button
        type="button"
        className="assist-owner-select assist-assign-btn"
        onClick={() => setOpen((o) => !o)}
        title="Assign to one or more teammates"
      >
        <AppIcon name="specialist" size={11} /> {label}
        <span className="assist-assign-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="assist-assign-panel">
          <div className="assist-assign-head">Assign to</div>
          <div className="assist-assign-opts">
            {!ownerKnown && (
              <label className="assist-assign-opt">
                <input type="checkbox" checked readOnly />
                <span>{ownerName}</span>
              </label>
            )}
            {members.map((m) => (
              <label key={m.id} className="assist-assign-opt">
                <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
                <span>{m.id === currentUserId ? 'Me' : m.displayName}</span>
              </label>
            ))}
          </div>
          <div className="assist-assign-foot">
            <span className="assist-assign-hint">Extra picks get their own copy.</span>
            <button type="button" className="assist-mini-btn primary" onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskThread({
  taskId,
  contextType,
  members,
}: {
  taskId: string;
  contextType: 'task' | 'action';
  members: TeamMember[];
}) {
  const [notes, setNotes] = useState<TeamNoteRecord[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchTeamNotes(contextType, taskId);
        if (!cancelled) setNotes(data);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, contextType]);

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const note = await postTeamNote({ contextType, contextKey: taskId, body: text });
      setNotes((prev) => [...prev, note]);
      setBody('');
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const handles = members
    .slice(0, 4)
    .map((m) => m.handle)
    .join(' ');

  return (
    <div className="assist-thread">
      {loaded && notes.length === 0 && (
        <div className="assist-thread-empty">
          Start the thread. Mention a teammate with {handles || '@name'} to loop them in.
        </div>
      )}
      {notes.map((n) => (
        <div key={n.id} className="assist-thread-msg">
          <span className="assist-thread-author">{n.authorName}</span>
          <span
            className="assist-thread-text"
            dangerouslySetInnerHTML={{ __html: renderInline(n.body) }}
          />
        </div>
      ))}
      <div ref={endRef} />
      <div className="assist-thread-input-row">
        <input
          className="assist-task-input"
          placeholder="Comment or @mention a teammate…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          disabled={busy}
        />
        <button type="button" className="assist-add-btn" onClick={() => void send()} disabled={busy}>
          <AppIcon name="send" size={12} />
        </button>
      </div>
    </div>
  );
}

function renderInline(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/@([a-z0-9._-]+)/gi, '<span class="assist-mention-tag">@$1</span>');
}
