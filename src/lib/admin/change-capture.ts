import type { ChangeRequestInput } from '@/lib/services/product-change-requests';
import { CHANGE_TYPES, CHANGE_PRIORITIES, CHANGE_SCREEN_PRESETS, CHANGE_APP_AREAS } from '@/lib/services/product-change-requests';
import type { ChangePriority, ChangeType } from '@/lib/services/product-change-requests';
import { adminViewLabel } from '@/lib/assistant/admin-hank-page-context';

export const FRANK_CAPTURE_SYSTEM_PROMPT = `You are Frank, helping Candid admins write Product roadmap change requests from an on-page capture.

Your job is DRAFT — turn rough notes + page context into a structured change-request field patch.

## Type guidance (use these exact change_type values)
- bug: something broken or wrong
- ui: visual/layout only
- flow: steps/workflow change
- feature: new capability users could not do before
- enhancement: improvement to something that already exists
- tech_debt: internal cleanup with no user-facing behavior change
- content: copy, docs, emails

## Priority values
p0, p1, p2, p3 (with meanings: critical, high, normal, low)

## Rules
- Respond with ONLY a single JSON object (no markdown fences unless needed; prefer raw JSON).
- Shape:
{
  "summary": "short plain-language notes for the author",
  "fields": { ...optional partial field patch... }
}
- fields keys may include: title, change_type, priority, screen, app_areas, current_behavior, desired_behavior, user_flow_steps, change_solves, acceptance_criteria, out_of_scope, risk_notes, demo_impact, related_files
- change_type must be one of: ${CHANGE_TYPES.join(', ')}
- priority must be one of: ${CHANGE_PRIORITIES.join(', ')}
- Prefer screen presets when possible: ${CHANGE_SCREEN_PRESETS.slice(0, 12).join('; ')}…
- Prefer app_areas as comma-separated list from: ${CHANGE_APP_AREAS.slice(0, 15).join('; ')}…
- Do not invent acceptance criteria that contradict the author's note.
- Fill as many fields as you reasonably can from the notes + page context.
- related_files: comma-separated paths only when you can infer them confidently from the screen.
- **Do not** copy the same sentence into desired_behavior and change_solves. change_solves = one short outcome; desired_behavior = what the UI/product should do.
- current_behavior: describe the broken/current UX in plain language. Never paste raw click labels, banner text, or "Clicked:" debug strings.
- title: short (≤80 chars), specific.`;

export type CaptureFrankFields = Partial<
  Pick<
    ChangeRequestInput,
    | 'title'
    | 'change_type'
    | 'priority'
    | 'screen'
    | 'app_areas'
    | 'current_behavior'
    | 'desired_behavior'
    | 'user_flow_steps'
    | 'change_solves'
    | 'acceptance_criteria'
    | 'out_of_scope'
    | 'risk_notes'
    | 'demo_impact'
    | 'related_files'
  >
>;

export type CaptureTargetInfo = {
  label: string;
  tagName: string;
  className: string;
  testId: string | null;
  textSnippet: string;
};

const ADMIN_VIEW_SCREEN: Record<string, string> = {
  assistant: 'Admin → Frank / Ask Frank',
  customers: 'Admin → Accounts (customer detail)',
  leads: 'Admin → Leads',
  agents: 'Admin → Agents & Team',
  tickets: 'Admin → Action Center',
  commissions: 'Admin → Commissions',
  partners: 'Admin → Partners',
  messages: 'Admin → Message Center',
  custmessages: 'Admin → Customer Inbox',
  expenses: 'Admin → My Expenses',
  marketinghub: 'Admin → Marketing Hub',
  outreach: 'Admin → Outreach',
  adminsettings: 'Admin → Admin Settings',
  roadmap: 'Admin → Product roadmap / Change queue',
};

const ADMIN_VIEW_RELATED_FILES: Record<string, string> = {
  assistant: 'src/components/admin/AdminAssistantView.tsx',
  customers: 'src/components/admin/CustomerRecordDetail.tsx, src/components/CandidApp.tsx',
  leads: 'src/components/admin/AdminLeadsView.tsx',
  agents: 'src/components/admin/AdminAgentsView.tsx',
  tickets: 'src/components/admin/AdminActionCenter.tsx',
  commissions: 'src/components/admin/AdminCommissionsView.tsx',
  partners: 'src/components/suppliers/SupplierDetailPage.tsx',
  messages: 'src/components/admin/AdminMessageCenter.tsx',
  custmessages: 'src/components/admin/AdminCustomerMessages.tsx',
  expenses: 'src/components/admin/AdminExpensesView.tsx',
  marketinghub: 'src/components/admin/AdminMarketingHub.tsx',
  outreach: 'src/components/admin/AdminOutreachView.tsx',
  adminsettings: 'src/components/admin/AdminSettingsView.tsx',
  roadmap: 'src/components/admin/AdminRoadmapView.tsx, src/lib/services/product-change-requests.ts',
};

export function screenForAdminView(adminView: string): string {
  return ADMIN_VIEW_SCREEN[adminView] ?? `Admin → ${adminViewLabel(adminView)}`;
}

export function relatedFilesForAdminView(adminView: string): string {
  return ADMIN_VIEW_RELATED_FILES[adminView] ?? '';
}

export function describeCaptureTarget(el: Element | null): CaptureTargetInfo {
  if (!el || !(el instanceof Element)) {
    return { label: '(page)', tagName: '', className: '', testId: null, textSnippet: '' };
  }
  // Ignore capture chrome so banner/composer text never becomes "Clicked:"
  const from = el.closest('.cr-capture-ui') ? null : el;
  if (!from) {
    return { label: '(page)', tagName: '', className: '', testId: null, textSnippet: '' };
  }
  const interactive =
    from.closest(
      'button, a, [role="button"], input, select, textarea, label, h1, h2, h3, [data-testid], .modal, [role="dialog"]',
    ) ?? from;
  const aria =
    interactive.getAttribute('aria-label') ||
    interactive.getAttribute('title') ||
    interactive.getAttribute('placeholder') ||
    '';
  const text = (interactive.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const testId = interactive.getAttribute('data-testid');
  const className =
    typeof (interactive as HTMLElement).className === 'string'
      ? (interactive as HTMLElement).className.slice(0, 80)
      : '';
  const label =
    [aria, text, testId ? `#${testId}` : ''].filter(Boolean).join(' · ') ||
    interactive.tagName.toLowerCase();
  return {
    label,
    tagName: interactive.tagName.toLowerCase(),
    className,
    testId,
    textSnippet: text,
  };
}

export function parseFrankCaptureJson(text: string): { summary: string; fields: CaptureFrankFields } {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { summary: trimmed || 'Frank returned no structured suggestions.', fields: {} };
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      summary?: string;
      fields?: Record<string, unknown>;
    };
    return {
      summary: String(parsed.summary ?? '').trim() || 'Suggestions ready.',
      fields: sanitizeCaptureFields(parsed.fields ?? {}),
    };
  } catch {
    return { summary: trimmed || 'Could not parse Frank’s response.', fields: {} };
  }
}

function sanitizeCaptureFields(raw: Record<string, unknown>): CaptureFrankFields {
  const out: CaptureFrankFields = {};
  if (typeof raw.title === 'string' && raw.title.trim()) out.title = raw.title.trim();
  if (typeof raw.change_type === 'string' && (CHANGE_TYPES as readonly string[]).includes(raw.change_type)) {
    out.change_type = raw.change_type as ChangeType;
  }
  if (typeof raw.priority === 'string' && (CHANGE_PRIORITIES as readonly string[]).includes(raw.priority)) {
    out.priority = raw.priority as ChangePriority;
  }
  const stringKeys = [
    'screen',
    'app_areas',
    'current_behavior',
    'desired_behavior',
    'user_flow_steps',
    'change_solves',
    'acceptance_criteria',
    'out_of_scope',
    'risk_notes',
    'demo_impact',
    'related_files',
  ] as const;
  for (const key of stringKeys) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
  }
  return out;
}

export function buildDraftFromNote(input: {
  note: string;
  adminView: string;
  target: CaptureTargetInfo | null;
  frank?: CaptureFrankFields;
}): ChangeRequestInput {
  const frank = input.frank ?? {};
  const screen = frank.screen || screenForAdminView(input.adminView);
  const related = frank.related_files || relatedFilesForAdminView(input.adminView);
  const note = input.note.trim();
  const title =
    frank.title ||
    (note ? note.replace(/\s+/g, ' ').slice(0, 90) : `Capture on ${adminViewLabel(input.adminView)}`);

  // Context for reviewers — not raw click dumps
  const contextBits = [
    `Admin view: ${adminViewLabel(input.adminView)}`,
    input.target?.label && input.target.label !== '(page)'
      ? `UI focus: ${input.target.label}`
      : '',
  ].filter(Boolean);

  return {
    title,
    change_type: frank.change_type ?? (/\bbug\b/i.test(note) ? 'bug' : 'ui'),
    priority: frank.priority ?? 'p2',
    status: 'draft',
    screen,
    user_role: 'admin',
    current_behavior:
      frank.current_behavior ||
      (contextBits.length ? contextBits.join('\n') : 'See author note and attachments.'),
    desired_behavior: frank.desired_behavior || note || 'See capture note and attachments.',
    user_flow_steps: frank.user_flow_steps || '',
    // Never auto-duplicate the note into change_solves — Frank should fill this
    change_solves: frank.change_solves || '',
    acceptance_criteria: frank.acceptance_criteria || '',
    out_of_scope: frank.out_of_scope || '',
    app_areas: frank.app_areas || 'Product roadmap, Admin Settings',
    related_files: related,
    risk_notes: frank.risk_notes || '',
    demo_impact: frank.demo_impact || '',
    data_migration: 'none',
    implementation_path: 'spec_only',
  };
}
