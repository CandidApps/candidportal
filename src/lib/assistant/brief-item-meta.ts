import type {
  AssistantAction,
  AssistantActionKind,
  AssistantCall,
  AssistantEmailItem,
  AssistantRef,
  TriagedEmail,
} from '@/lib/assistant/types';

export type BriefItemLike = {
  title: string;
  why: string;
  ref?: AssistantRef | null;
  intent?: string | null;
};

export type BriefItemTagTone =
  | 'urgent'
  | 'partner'
  | 'customer'
  | 'renewal'
  | 'portal'
  | 'sla'
  | 'unread'
  | 'call'
  | 'mention';

export type BriefItemDisplayMeta = {
  sourceKey: string;
  sourceLabel: string;
  icon: 'email' | 'alerts' | 'phone' | 'calendar' | 'check' | 'specialist' | 'messages' | 'reports' | 'sparkles' | 'chart';
  accent: 'email' | 'portal' | 'call' | 'mention' | 'calendar' | 'task';
  contact?: string;
  org?: string;
  tags: Array<{ label: string; tone: BriefItemTagTone }>;
};

const PORTAL_KIND_SINGULAR: Record<AssistantActionKind, string> = {
  ticket: 'Service ticket',
  review_request: 'Review request',
  quote_request: 'Quote request',
  analysis_review: 'Bill analysis',
  reminder: 'Reminder',
};

const PORTAL_KIND_ICON: Record<AssistantActionKind, BriefItemDisplayMeta['icon']> = {
  ticket: 'messages',
  review_request: 'sparkles',
  quote_request: 'reports',
  analysis_review: 'chart',
  reminder: 'alerts',
};


function displayNameFromEmailField(raw: string): string {
  const trimmed = raw.trim();
  const angle = trimmed.match(/^(.+?)\s*<[^>]+>$/);
  if (angle?.[1]) return angle[1].replace(/^["']|["']$/g, '').trim();
  if (trimmed.includes('@')) return trimmed.split('@')[0] ?? trimmed;
  return trimmed;
}

function slaTagsFromWhy(why: string): BriefItemDisplayMeta['tags'] {
  if (/past 48h sla|sla-breached/i.test(why)) return [{ label: 'Past SLA', tone: 'sla' }];
  if (/nearing 48h sla|sla-approaching/i.test(why)) return [{ label: 'SLA soon', tone: 'sla' }];
  return [];
}

function actionUrgencyTag(a: AssistantAction): BriefItemDisplayMeta['tags'] {
  const sla = slaTagsFromWhy(`${a.subtitle} ${a.who}`);
  if (sla.length) return sla;
  if (a.urgency === 'urgent') return [{ label: 'Urgent', tone: 'urgent' }];
  if (a.urgency === 'warn') return [{ label: 'Needs attention', tone: 'portal' }];
  return [{ label: 'Portal', tone: 'portal' }];
}

const TRIAGED_TAG_LABEL: Record<TriagedEmail['tag'], string> = {
  urgent: 'Urgent',
  partner: 'Partner',
  customer: 'Customer',
  renewal: 'Renewal',
};

export function getBriefItemDisplayMeta(
  item: BriefItemLike,
  ctx: {
    inboxById: Map<string, AssistantEmailItem>;
    actionById: Map<string, AssistantAction>;
    callById: Map<string, AssistantCall>;
    triagedById: Map<string, TriagedEmail>;
  },
): BriefItemDisplayMeta {
  const ref = item.ref;
  const why = item.why ?? '';

  if (ref?.type === 'email') {
    const m = ctx.inboxById.get(ref.id);
    const triaged = ctx.triagedById.get(ref.id);
    const contact = triaged?.contact ?? (m ? displayNameFromEmailField(m.from) : undefined);
    const org =
      triaged?.business && triaged.business !== 'Unknown'
        ? triaged.business
        : m?.subject
          ? undefined
          : undefined;
    const tags: BriefItemDisplayMeta['tags'] = triaged
      ? [{ label: TRIAGED_TAG_LABEL[triaged.tag], tone: triaged.tag }]
      : m?.isUnread
        ? [{ label: 'Unread', tone: 'unread' }]
        : [{ label: 'Email', tone: 'customer' }];
    return {
      sourceKey: 'email',
      sourceLabel: 'Email',
      icon: 'email',
      accent: 'email',
      contact,
      org: org ?? (triaged?.business !== 'Unknown' ? triaged?.business : undefined),
      tags,
    };
  }

  if (ref?.type === 'action') {
    const a = ctx.actionById.get(ref.id);
    if (a) {
      return {
        sourceKey: a.kind,
        sourceLabel: PORTAL_KIND_SINGULAR[a.kind],
        icon: PORTAL_KIND_ICON[a.kind],
        accent: 'portal',
        contact: a.who || undefined,
        org: a.subtitle !== PORTAL_KIND_SINGULAR[a.kind] ? a.subtitle : undefined,
        tags: actionUrgencyTag(a),
      };
    }
    const sla = slaTagsFromWhy(why);
    return {
      sourceKey: 'portal',
      sourceLabel: 'Portal action',
      icon: 'alerts',
      accent: 'portal',
      tags: sla.length ? sla : [{ label: 'Portal', tone: 'portal' }],
    };
  }

  if (ref?.type === 'mention') {
    const author = item.title.replace(/ mentioned you$/i, '').trim();
    return {
      sourceKey: 'mention',
      sourceLabel: 'Mention',
      icon: 'specialist',
      accent: 'mention',
      contact: author || undefined,
      org: why.split(' · ')[0]?.trim() || undefined,
      tags: [{ label: 'Unread', tone: 'mention' }],
    };
  }

  if (ref?.type === 'call') {
    const c = ctx.callById.get(ref.id);
    const isVm = /voicemail/i.test(c?.state ?? '') || /voicemail/i.test(why);
    return {
      sourceKey: 'call',
      sourceLabel: isVm ? 'Voicemail' : 'Missed call',
      icon: 'phone',
      accent: 'call',
      contact: c?.contactName || c?.contactPhone || undefined,
      org: c?.contactPhone && c?.contactName ? c.contactPhone : c?.contactEmail || undefined,
      tags: [{ label: isVm ? 'Voicemail' : 'Callback', tone: 'call' }],
    };
  }

  if (ref?.type === 'calendar') {
    return {
      sourceKey: 'calendar',
      sourceLabel: 'Meeting',
      icon: 'calendar',
      accent: 'calendar',
      tags: [{ label: 'Today', tone: 'customer' }],
    };
  }

  if (ref?.type === 'task') {
    return {
      sourceKey: 'task',
      sourceLabel: 'Task',
      icon: 'check',
      accent: 'task',
      tags: /overdue/i.test(why) ? [{ label: 'Overdue', tone: 'urgent' }] : [{ label: 'Task', tone: 'portal' }],
    };
  }

  if (/reply to|email/i.test(item.title) || item.intent === 'reply') {
    return {
      sourceKey: 'email',
      sourceLabel: 'Email',
      icon: 'email',
      accent: 'email',
      contact: item.title.replace(/^reply to /i, '').trim() || undefined,
      tags: [{ label: 'Email', tone: 'customer' }],
    };
  }

  if (/call back|voicemail|missed call/i.test(item.title)) {
    return {
      sourceKey: 'call',
      sourceLabel: /voicemail/i.test(item.title) ? 'Voicemail' : 'Missed call',
      icon: 'phone',
      accent: 'call',
      contact: item.title.replace(/^call back /i, '').trim() || undefined,
      tags: [{ label: 'Callback', tone: 'call' }],
    };
  }

  const sla = slaTagsFromWhy(why);
  return {
    sourceKey: 'portal',
    sourceLabel: 'Priority',
    icon: 'alerts',
    accent: 'portal',
    tags: sla.length ? sla : [{ label: 'Action needed', tone: 'portal' }],
  };
}

/** Strip contact/org duplication from the why line when shown in the meta row. */
export function briefWhyDetail(why: string, meta: BriefItemDisplayMeta): string {
  let detail = why.trim();
  if (!detail) return '';
  if (meta.contact && detail.includes(meta.contact)) {
    detail = detail.replace(meta.contact, '').replace(/\s*·\s*/g, ' · ').trim();
  }
  if (meta.org && detail.startsWith(meta.org)) {
    detail = detail.slice(meta.org.length).replace(/^\s*·\s*/, '').trim();
  }
  detail = detail
    .replace(/\s*·\s*⚠ past 48h sla/gi, '')
    .replace(/\s*·\s*⏳ nearing 48h sla/gi, '')
    .replace(/\s*·\s*urgent\b/gi, '')
    .replace(/\s*·\s*needs attention/gi, '')
    .replace(/^·\s*|·\s*$/g, '')
    .trim();
  return detail;
}
