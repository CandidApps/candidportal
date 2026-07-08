import type {
  AssistantAction,
  AssistantCall,
  AssistantEmailItem,
  AssistantMention,
  AssistantMissed,
  AssistantPriority,
  AssistantCalendarEvent,
} from '@/lib/assistant/types';

export type BriefSlaState = 'breached' | 'approaching' | null;

export type BriefDeterministicInput = {
  now: Date;
  actions: AssistantAction[];
  inbox: AssistantEmailItem[];
  mentions: AssistantMention[];
  missedCalls: AssistantCall[];
  events: AssistantCalendarEvent[];
  tasks: {
    title: string;
    priority: string;
    due_at: string | null;
    due_date: string | null;
    created_at: string | null;
  }[];
  slaFor: (action: AssistantAction) => BriefSlaState;
  callLabel: (call: AssistantCall) => string;
};

type Scored<T> = T & { score: number };

function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

function isToday(isoOrMs: string | number, now: Date): boolean {
  const t = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  if (Number.isNaN(t)) return false;
  return t >= startOfDay(now).getTime();
}

function isBeforeToday(isoOrMs: string | number, now: Date): boolean {
  const t = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  if (Number.isNaN(t)) return false;
  return t < startOfDay(now).getTime();
}

function taskDueIso(t: BriefDeterministicInput['tasks'][number]): string | null {
  return t.due_at ?? (t.due_date ? `${t.due_date}T12:00:00Z` : null);
}

function dedupePriorities(items: Scored<AssistantPriority>[]): AssistantPriority[] {
  const seen = new Set<string>();
  const out: AssistantPriority[] = [];
  for (const item of items.sort((a, b) => b.score - a.score)) {
    const key =
      item.ref?.type === 'email' || item.ref?.type === 'action' || item.ref?.type === 'mention' || item.ref?.type === 'call'
        ? `${item.ref.type}:${item.ref.id}`
        : `${item.ref?.type ?? 'none'}:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { score: _score, ...rest } = item;
    out.push(rest);
    if (out.length >= 6) break;
  }
  return out;
}

/** Carry-over from before today — not today's SLA or inbox (those belong in priorities). */
export function buildMissedItems(input: BriefDeterministicInput): AssistantMissed[] {
  const { now, actions, inbox, mentions, missedCalls, tasks, slaFor, callLabel } = input;
  const missed: AssistantMissed[] = [];

  for (const a of actions) {
    if (!isBeforeToday(a.createdAt, now)) continue;
    const sla = slaFor(a);
    missed.push({
      title: a.title,
      why: `${a.subtitle}${a.who ? ` · ${a.who}` : ''}${sla === 'breached' ? ' · ⚠ past 48h SLA' : sla === 'approaching' ? ' · ⏳ nearing 48h SLA' : ''}`,
      ref: { type: 'action', id: a.id },
      intent: 'open',
      since: a.createdAt,
    });
  }

  for (const m of inbox) {
    if (m.isUnread && isBeforeToday(m.receivedTime, now)) {
      missed.push({
        title: `Reply to ${m.from}`,
        why: m.subject,
        ref: { type: 'email', id: m.id },
        intent: 'reply',
        since: new Date(m.receivedTime).toISOString(),
      });
    }
  }

  for (const mn of mentions) {
    if (isBeforeToday(mn.createdAt, now)) {
      missed.push({
        title: `${mn.authorName} mentioned you`,
        why: `${mn.contextLabel} · ${mn.body.slice(0, 80)}`,
        ref: { type: 'mention', id: mn.id },
        intent: 'open',
        since: mn.createdAt,
      });
    }
  }

  for (const c of missedCalls) {
    const when = c.startedAt ? new Date(c.startedAt).getTime() : 0;
    if (when && isBeforeToday(when, now)) {
      missed.push({
        title: `Call back ${callLabel(c)}`,
        why: `${/voicemail/i.test(c.state ?? '') ? 'Voicemail' : 'Missed call'}${c.contactPhone ? ` · ${c.contactPhone}` : ''}`,
        ref: { type: 'call', id: c.id },
        intent: 'call',
        since: c.startedAt ?? undefined,
      });
    }
  }

  for (const t of tasks) {
    const dueIso = taskDueIso(t);
    const overdue = dueIso && new Date(dueIso).getTime() < now.getTime();
    const createdIso = t.created_at;
    if (overdue || (createdIso && isBeforeToday(createdIso, now))) {
      missed.push({
        title: String(t.title),
        why: overdue
          ? `Overdue task · was due ${dueIso?.slice(0, 10) ?? ''}`
          : `Open task${dueIso ? ` · due ${dueIso.slice(0, 10)}` : ''}`,
        ref: { type: 'task' },
        intent: 'open',
        since: createdIso ?? undefined,
      });
    }
  }

  missed.sort((a, b) => new Date(a.since ?? 0).getTime() - new Date(b.since ?? 0).getTime());
  return missed.slice(0, 8);
}

/** Today's focus items when the AI brief is empty or fails to parse. */
export function buildTodayPriorities(input: BriefDeterministicInput): AssistantPriority[] {
  const { now, actions, inbox, mentions, missedCalls, events, tasks, slaFor, callLabel } = input;
  const items: Scored<AssistantPriority>[] = [];

  for (const a of actions) {
    const sla = slaFor(a);
    if (sla) {
      items.push({
        title: a.title,
        why: `${a.subtitle}${a.who ? ` · ${a.who}` : ''}${sla === 'breached' ? ' · ⚠ past 48h SLA' : ' · ⏳ nearing 48h SLA'}`,
        ref: { type: 'action', id: a.id },
        intent: 'open',
        since: a.createdAt,
        score: sla === 'breached' ? 100 : 90,
      });
      continue;
    }
    if (a.urgency === 'urgent') {
      items.push({
        title: a.title,
        why: `${a.subtitle}${a.who ? ` · ${a.who}` : ''} · urgent`,
        ref: { type: 'action', id: a.id },
        intent: 'open',
        since: a.createdAt,
        score: 82,
      });
      continue;
    }
    if (a.urgency === 'warn') {
      items.push({
        title: a.title,
        why: `${a.subtitle}${a.who ? ` · ${a.who}` : ''} · needs attention`,
        ref: { type: 'action', id: a.id },
        intent: 'open',
        since: a.createdAt,
        score: 68,
      });
      continue;
    }
    if (isToday(a.createdAt, now)) {
      items.push({
        title: a.title,
        why: `${a.subtitle}${a.who ? ` · ${a.who}` : ''}`,
        ref: { type: 'action', id: a.id },
        intent: 'open',
        since: a.createdAt,
        score: 55,
      });
    }
  }

  for (const m of inbox) {
    if (m.isUnread && isToday(m.receivedTime, now)) {
      items.push({
        title: `Reply to ${m.from}`,
        why: m.subject,
        ref: { type: 'email', id: m.id },
        intent: 'reply',
        since: new Date(m.receivedTime).toISOString(),
        score: 75,
      });
    }
  }

  for (const mn of mentions) {
    if (isToday(mn.createdAt, now)) {
      items.push({
        title: `${mn.authorName} mentioned you`,
        why: `${mn.contextLabel} · ${mn.body.slice(0, 80)}`,
        ref: { type: 'mention', id: mn.id },
        intent: 'open',
        since: mn.createdAt,
        score: 70,
      });
    }
  }

  for (const c of missedCalls) {
    const when = c.startedAt ? new Date(c.startedAt).getTime() : 0;
    if (when && isToday(when, now)) {
      items.push({
        title: `Call back ${callLabel(c)}`,
        why: `${/voicemail/i.test(c.state ?? '') ? 'Voicemail' : 'Missed call'}${c.contactPhone ? ` · ${c.contactPhone}` : ''}`,
        ref: { type: 'call', id: c.id },
        intent: 'call',
        since: c.startedAt ?? undefined,
        score: 65,
      });
    }
  }

  for (const t of tasks) {
    const dueIso = taskDueIso(t);
    const dueMs = dueIso ? new Date(dueIso).getTime() : NaN;
    const dueToday = !Number.isNaN(dueMs) && isToday(dueMs, now);
    const urgent = t.priority === 'urgent' || t.priority === 'high';
    const createdToday = t.created_at ? isToday(t.created_at, now) : false;
    if (dueToday || (urgent && createdToday)) {
      items.push({
        title: String(t.title),
        why: dueToday
          ? `Due today${urgent ? ` · ${t.priority}` : ''}`
          : `High-priority task from today`,
        ref: { type: 'task' },
        intent: 'open',
        since: t.created_at ?? undefined,
        score: dueToday ? (t.priority === 'urgent' ? 85 : 60) : 58,
      });
    }
  }

  const endOfToday = startOfDay(now);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const nextMeeting = events
    .filter((e) => {
      const start = new Date(e.start).getTime();
      return !e.allDay && start >= now.getTime() && start < endOfToday.getTime();
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];

  if (nextMeeting) {
    const start = new Date(nextMeeting.start);
    const clock = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    items.push({
      title: `Up next: ${nextMeeting.title}`,
      why: `Today at ${clock}${nextMeeting.attendeeCount ? ` · ${nextMeeting.attendeeCount} attendees` : ''}`,
      ref: { type: 'calendar' },
      intent: 'schedule',
      since: nextMeeting.start,
      score: 62,
    });
  }

  return dedupePriorities(items);
}

export function mergePriorities(ai: AssistantPriority[], fallback: AssistantPriority[]): AssistantPriority[] {
  if (ai.length === 0) return fallback;
  const seen = new Set(
    ai.map((p) =>
      p.ref?.type === 'email' || p.ref?.type === 'action' || p.ref?.type === 'mention' || p.ref?.type === 'call'
        ? `${p.ref.type}:${p.ref.id}`
        : p.title,
    ),
  );
  const merged = [...ai];
  for (const p of fallback) {
    const key =
      p.ref?.type === 'email' || p.ref?.type === 'action' || p.ref?.type === 'mention' || p.ref?.type === 'call'
        ? `${p.ref.type}:${p.ref.id}`
        : p.title;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(p);
    if (merged.length >= 6) break;
  }
  return merged;
}
