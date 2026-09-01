export const IMPLEMENTATION_PATHS = [
  'spec_only',
  'local_unverified',
  'local_verified',
  'ready_for_pr',
] as const;
export type ImplementationPath = (typeof IMPLEMENTATION_PATHS)[number];

export const IMPLEMENTATION_PATH_LABEL: Record<ImplementationPath, string> = {
  spec_only: 'I haven\u2019t built this yet \u2014 spec for review',
  local_unverified: 'I changed something locally \u2014 haven\u2019t tested yet',
  local_verified: 'I tested locally \u2014 ready for team review',
  ready_for_pr: 'Approved \u2014 create pull request',
};

export const IMPLEMENTATION_PATH_HINT =
  'Where you are in the workflow. Push/PR is only available after team acceptance.';

/** Paths available when creating a new change request (excludes ready_for_pr). */
export const IMPLEMENTATION_PATHS_ON_CREATE: ImplementationPath[] = [
  'spec_only',
  'local_unverified',
  'local_verified',
];

export type CursorPromptAction = 'file_from_diff' | 'verify' | 'implement' | 'push_pr';

export const CHANGE_TYPES = [
  'bug',
  'ui',
  'flow',
  'feature',
  'enhancement',
  'tech_debt',
  'content',
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const CHANGE_PRIORITIES = ['p0', 'p1', 'p2', 'p3'] as const;
export type ChangePriority = (typeof CHANGE_PRIORITIES)[number];

export const CHANGE_STATUSES = [
  'draft',
  'in_review',
  'changes_requested',
  'accepted_ready',
  'accepted_needs_design',
  'accepted_needs_spike',
  'accepted_blocked',
  'deferred',
  'rejected',
  'in_progress',
  'done',
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const CHANGE_USER_ROLES = ['admin', 'member', 'both', 'partner'] as const;
export type ChangeUserRole = (typeof CHANGE_USER_ROLES)[number];

export const CHANGE_DISPOSITIONS = [
  'changes_requested',
  'accepted_ready',
  'accepted_needs_design',
  'accepted_needs_spike',
  'accepted_blocked',
  'deferred',
  'rejected',
] as const;
export type ChangeDisposition = (typeof CHANGE_DISPOSITIONS)[number];

export const BLAST_RADII = ['local', 'feature', 'cross_cutting'] as const;
export type BlastRadius = (typeof BLAST_RADII)[number];

export const BLAST_RADIUS_LABEL: Record<BlastRadius, string> = {
  local: 'Local — one screen or component',
  feature: 'Feature — multiple files in one product area',
  cross_cutting: 'Cross-cutting — auth, data model, or many areas',
};

export const REVIEW_FIELD_HINTS = {
  disposition:
    'Your verdict on this spec. Only “Accept & ready for Cursor” moves it toward implementation (and only after all assigned reviewers agree).',
  comment:
    'Why you chose this disposition. Call out gaps in the spec, missing acceptance criteria, or questions for the author.',
  risks:
    'What could break if we ship this? Data loss, wrong customer visibility, demo regressions, migration mistakes, etc.',
  must_preserve:
    'Existing behavior or integrations that must keep working. E.g. “Admin preview still works”, “Do not change Plaid paths”.',
  blast_radius:
    'How far the change likely spreads in the codebase — helps Cursor scope the impact review.',
} as const;

export type ChangeRequest = {
  id: string;
  public_id: string;
  title: string;
  change_type: ChangeType;
  priority: ChangePriority;
  status: ChangeStatus;
  screen: string;
  user_role: ChangeUserRole;
  current_behavior: string;
  desired_behavior: string;
  user_flow_steps: string;
  change_solves: string;
  acceptance_criteria: string;
  out_of_scope: string;
  app_areas: string;
  related_files: string;
  data_migration: 'none' | 'maybe' | 'yes';
  risk_notes: string;
  demo_impact: string;
  owner: string;
  reviewers: string;
  milestone_id: string | null;
  implementation_path: ImplementationPath;
  linked_branch: string;
  linked_pr_url: string;
  last_verification_at: string | null;
  last_verification_summary: string;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

export type ChangeReview = {
  id: string;
  change_request_id: string;
  reviewer_email: string;
  disposition: ChangeDisposition;
  comment: string;
  risks: string;
  must_preserve: string;
  blast_radius: BlastRadius;
  created_at: string;
};

export type ChangeEvent = {
  id: string;
  change_request_id: string | null;
  event_type: string;
  summary: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  actor_email: string | null;
  created_at: string;
};

export type ChangeRequestInput = {
  title: string;
  change_type: ChangeType;
  priority?: ChangePriority;
  status?: ChangeStatus;
  screen?: string;
  user_role?: ChangeUserRole;
  current_behavior?: string;
  desired_behavior?: string;
  user_flow_steps?: string;
  change_solves?: string;
  acceptance_criteria?: string;
  out_of_scope?: string;
  app_areas?: string;
  related_files?: string;
  data_migration?: 'none' | 'maybe' | 'yes';
  risk_notes?: string;
  demo_impact?: string;
  owner?: string;
  reviewers?: string;
  milestone_id?: string | null;
  implementation_path?: ImplementationPath;
  linked_branch?: string;
  linked_pr_url?: string;
  last_verification_at?: string | null;
  last_verification_summary?: string;
};

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  bug: 'Bug',
  ui: 'UI',
  flow: 'Flow',
  feature: 'Feature',
  enhancement: 'Enhancement',
  tech_debt: 'Tech debt',
  content: 'Content',
};

export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  accepted_ready: 'Accepted — ready for Cursor',
  accepted_needs_design: 'Accepted — needs design',
  accepted_needs_spike: 'Accepted — needs spike',
  accepted_blocked: 'Accepted — blocked',
  deferred: 'Deferred',
  rejected: 'Rejected',
  in_progress: 'In progress',
  done: 'Done',
};

export const DISPOSITION_LABEL: Record<ChangeDisposition, string> = {
  changes_requested: 'Request changes',
  accepted_ready: 'Accept & ready for Cursor',
  accepted_needs_design: 'Accept but needs design',
  accepted_needs_spike: 'Accept but needs spike',
  accepted_blocked: 'Accept but blocked',
  deferred: 'Defer',
  rejected: 'Reject',
};

/** Known product surfaces — multi-select with free-text “Other”. */
export const CHANGE_APP_AREAS = [
  'MyAssistant',
  'Action Center',
  'Accounts / CRM',
  'Leads',
  'Agents & Team',
  'Commissions',
  'My Expenses',
  'Partners / Suppliers',
  'Marketing Hub',
  'Outreach',
  'Team Message Center',
  'Customer messages',
  'Admin Settings',
  'Product roadmap',
  'Member Dashboard',
  'My Services',
  'Quotes & Proposals',
  'Member Message Center',
  'Find Solutions',
  'Tech Spend',
  'Member Settings',
  'Auth / invites',
  'Bill analysis',
  'Documents',
  'Billing',
  'Portal overall',
] as const;

export const CHANGE_SCREEN_PRESETS = [
  'Admin → MyAssistant',
  'Admin → Action Center',
  'Admin → Accounts (customer detail)',
  'Admin → Quotes workflow',
  'Admin → Message Center',
  'Admin → Partners',
  'Admin → Commissions',
  'Admin → Product roadmap / Change queue',
  'Member → Dashboard',
  'Member → My Services',
  'Member → Quotes & Proposals',
  'Member → Message Center',
  'Member → Find Solutions',
  'Member → Tech Spend',
  'Member → Settings',
  'Auth / invite / set password',
] as const;

export const CHANGE_FIELD_HINTS = {
  title: 'Short name for the change (what someone scanning the queue should understand).',
  screen: 'Where in the product this shows up. Pick a preset or type your own path.',
  app_areas: 'Which product areas this touches. Select all that apply; add Other if needed.',
  current_behavior:
    'What happens today. Be specific: who does what, what they see, what’s wrong or missing.',
  desired_behavior:
    'What should happen instead. Describe the end state as if writing acceptance for a teammate.',
  user_flow_steps:
    'Numbered steps a user takes after the change (1. … 2. …). Include happy path only unless edge cases matter.',
  change_solves:
    'The user or business problem this fixes — why we’re doing it. One or two sentences on pain, not the solution.',
  acceptance_criteria:
    'Testable checks that prove it’s done. Prefer bullets: “Given X, when Y, then Z.”',
  out_of_scope:
    'What this ticket must NOT include (so Cursor doesn’t expand scope). E.g. no Plaid, no redesign.',
  related_files:
    'Optional code paths or modules to start from (src/…). Screenshots belong in UI screenshots below.',
  risk_notes:
    'What could break, confuse demos, or need careful QA if we get this wrong.',
  demo_impact:
    'Impact on beta/demos (Wayne, Bruce, etc.): safe / blocks demo / hide until QA’d.',
  owner: 'Primary owner accountable for this change (admin on the roster).',
  reviewers: 'Admins who should review before Cursor implements.',
  timeline_item:
    'Link to a GTM timeline milestone or task. When this change is marked Done, the linked item completes automatically.',
  screenshots:
    'UI screenshots or PDFs showing current UI, mock, or bug. Multiple files allowed.',
} as const;

export type ChangeAttachment = {
  id: string;
  change_request_id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  uploaded_by_email: string | null;
  created_at: string;
  /** Short-lived signed URL for preview/download (when provided by API). */
  url?: string | null;
};

export function mapChangeAttachment(row: Record<string, unknown>): ChangeAttachment {
  return {
    id: String(row.id),
    change_request_id: String(row.change_request_id),
    storage_path: String(row.storage_path ?? ''),
    file_name: String(row.file_name ?? ''),
    content_type: String(row.content_type ?? ''),
    byte_size: Number(row.byte_size) || 0,
    uploaded_by_email: (row.uploaded_by_email as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    url: (row.url as string | null | undefined) ?? null,
  };
}

export function mapChangeRequest(row: Record<string, unknown>): ChangeRequest {
  return {
    id: String(row.id),
    public_id: String(row.public_id),
    title: String(row.title ?? ''),
    change_type: row.change_type as ChangeType,
    priority: (row.priority as ChangePriority) ?? 'p2',
    status: (row.status as ChangeStatus) ?? 'draft',
    screen: String(row.screen ?? ''),
    user_role: (row.user_role as ChangeUserRole) ?? 'both',
    current_behavior: String(row.current_behavior ?? ''),
    desired_behavior: String(row.desired_behavior ?? ''),
    user_flow_steps: String(row.user_flow_steps ?? ''),
    change_solves: String(row.change_solves ?? ''),
    acceptance_criteria: String(row.acceptance_criteria ?? ''),
    out_of_scope: String(row.out_of_scope ?? ''),
    app_areas: String(row.app_areas ?? ''),
    related_files: String(row.related_files ?? ''),
    data_migration: (row.data_migration as ChangeRequest['data_migration']) ?? 'none',
    risk_notes: String(row.risk_notes ?? ''),
    demo_impact: String(row.demo_impact ?? ''),
    owner: String(row.owner ?? ''),
    reviewers: String(row.reviewers ?? ''),
    milestone_id: (row.milestone_id as string | null) ?? null,
    implementation_path: isImplementationPath(row.implementation_path)
      ? row.implementation_path
      : 'spec_only',
    linked_branch: String(row.linked_branch ?? ''),
    linked_pr_url: String(row.linked_pr_url ?? ''),
    last_verification_at: (row.last_verification_at as string | null) ?? null,
    last_verification_summary: String(row.last_verification_summary ?? ''),
    created_by_email: (row.created_by_email as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

export function mapChangeReview(row: Record<string, unknown>): ChangeReview {
  return {
    id: String(row.id),
    change_request_id: String(row.change_request_id),
    reviewer_email: String(row.reviewer_email ?? ''),
    disposition: row.disposition as ChangeDisposition,
    comment: String(row.comment ?? ''),
    risks: String(row.risks ?? ''),
    must_preserve: String(row.must_preserve ?? ''),
    blast_radius: (row.blast_radius as BlastRadius) ?? 'local',
    created_at: String(row.created_at ?? ''),
  };
}

export function mapChangeEvent(row: Record<string, unknown>): ChangeEvent {
  return {
    id: String(row.id),
    change_request_id: (row.change_request_id as string | null) ?? null,
    event_type: String(row.event_type ?? ''),
    summary: String(row.summary ?? ''),
    before_state: (row.before_state as Record<string, unknown> | null) ?? null,
    after_state: (row.after_state as Record<string, unknown> | null) ?? null,
    actor_email: (row.actor_email as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
  };
}

export function changeSnapshot(c: ChangeRequest): Record<string, unknown> {
  return { ...c };
}

export function isImplementationPath(v: unknown): v is ImplementationPath {
  return typeof v === 'string' && (IMPLEMENTATION_PATHS as readonly string[]).includes(v);
}

/** Initial CR status when filing, based on implementation path dropdown. */
export function resolveInitialStatusFromImplementationPath(path: ImplementationPath): ChangeStatus {
  if (path === 'local_verified' || path === 'ready_for_pr') return 'in_review';
  return 'draft';
}

/** Whether ready_for_pr is allowed for the current CR status. */
export function canSetReadyForPr(status: ChangeStatus): boolean {
  return status === 'accepted_ready' || status === 'in_progress';
}

export function changeQueueUrl(origin?: string): string {
  const base = origin?.replace(/\/$/, '') ?? '';
  return base ? `${base}/admin#roadmap` : '/admin#roadmap';
}

/** Copy-paste prompts for Cursor Agent (Change queue detail buttons). */
export function buildCursorPrompt(
  change: ChangeRequest,
  action: CursorPromptAction,
  origin?: string,
): string {
  const cr = change.public_id;
  const url = changeQueueUrl(origin);

  switch (action) {
    case 'file_from_diff':
      return [
        `I have local changes and need to file or update change request ${cr}.`,
        '',
        'Run the start-change-request skill:',
        '- Inspect git diff, branch name, and files touched',
        '- Prefill the change queue form fields (especially related_files, app_areas, current/desired behavior)',
        `- Tell me to save at ${url} (Change queue tab)`,
        '- Do NOT implement or push until the CR is accepted_ready',
      ].join('\n');

    case 'verify':
      return [
        `Verify local changes against ${cr}: ${change.title}`,
        '',
        'Run the verify-change-request skill:',
        `- Load spec from Admin → Roadmap → Change queue (${url}) or GET /api/admin/change-requests`,
        '- Compare git diff vs related_files, app_areas, acceptance criteria, out_of scope, data_migration',
        '- Summarize alignment: aligned / minor_gaps / blocked',
        '- Suggest spec fixes if the author is non-technical',
        change.linked_branch ? `- Expected branch: ${change.linked_branch}` : '',
        '- Do NOT push unless status is accepted_ready and user explicitly asks',
      ]
        .filter(Boolean)
        .join('\n');

    case 'implement':
      return [
        `Implement ${cr}: ${change.title}`,
        '',
        'Run the implement-accepted-change skill.',
        `Confirm status is accepted_ready at ${url} before coding.`,
        'Show impact review first unless I already approved.',
      ].join('\n');

    case 'push_pr':
      return [
        `Verify ${cr} then push and open a pull request.`,
        '',
        'Steps:',
        '1. Run verify-change-request skill — fix any blocked gaps first',
        `2. Confirm ${cr} status is accepted_ready (see ${url})`,
        '3. Push branch with CR id in branch name if possible (feat/CR-xxxx-slug)',
        `4. gh pr create — body must include ${cr} and link acceptance criteria`,
        '5. PATCH the change request: linked_branch, linked_pr_url, status in_progress',
        'Do NOT push Plaid/Tech Spend unless explicitly asked.',
      ].join('\n');
  }
}

export function parseReviewerEmails(reviewers: string): string[] {
  return reviewers
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Consensus rules for team review:
 * - rejected / changes_requested / blocked / deferred / needs-* from ANY reviewer wins immediately
 * - accepted_ready only when EVERY assigned reviewer has submitted accepted_ready
 *   (if no reviewers assigned, one accepted_ready is enough)
 */
export function resolveChangeStatusFromReviews(
  reviewersField: string,
  reviews: ChangeReview[],
): ChangeStatus {
  if (!reviews.length) return 'in_review';

  const assigned = parseReviewerEmails(reviewersField);

  const blockOrder: ChangeDisposition[] = [
    'rejected',
    'changes_requested',
    'accepted_blocked',
    'deferred',
    'accepted_needs_design',
    'accepted_needs_spike',
  ];
  for (const d of blockOrder) {
    if (reviews.some((r) => r.disposition === d)) {
      return d as ChangeStatus;
    }
  }

  const hasReady = reviews.some((r) => r.disposition === 'accepted_ready');
  if (hasReady) {
    if (assigned.length === 0) return 'accepted_ready';
    const eachReady = assigned.every((email) =>
      reviews.some(
        (r) =>
          r.disposition === 'accepted_ready' &&
          r.reviewer_email.toLowerCase() === email.toLowerCase(),
      ),
    );
    return eachReady ? 'accepted_ready' : 'in_review';
  }

  return 'in_review';
}

export function getReviewProgress(
  reviewersField: string,
  reviews: ChangeReview[],
): { assigned: string[]; ready: string[]; pending: string[] } {
  const assigned = parseReviewerEmails(reviewersField);
  const ready = assigned.filter((email) =>
    reviews.some(
      (r) =>
        r.disposition === 'accepted_ready' &&
        r.reviewer_email.toLowerCase() === email.toLowerCase(),
    ),
  );
  const pending = assigned.filter((e) => !ready.includes(e));
  return { assigned, ready, pending };
}

/** Agent-oriented markdown spec for Cursor skill consumption. */
export function formatChangeSpecMarkdown(
  c: ChangeRequest,
  reviews: ChangeReview[] = [],
  attachments: ChangeAttachment[] = [],
): string {
  const lines = [
    `# ${c.public_id}: ${c.title}`,
    '',
    `- **Type:** ${CHANGE_TYPE_LABEL[c.change_type]}`,
    `- **Priority:** ${c.priority.toUpperCase()}`,
    `- **Status:** ${CHANGE_STATUS_LABEL[c.status]}`,
    `- **Screen / route:** ${c.screen || '—'}`,
    `- **User role:** ${c.user_role}`,
    `- **App areas:** ${c.app_areas || '—'}`,
    `- **Owner:** ${c.owner || '—'}`,
    `- **Reviewers:** ${c.reviewers || '—'}`,
    `- **Implementation path:** ${IMPLEMENTATION_PATH_LABEL[c.implementation_path]}`,
    `- **Linked branch:** ${c.linked_branch || '—'}`,
    `- **Linked PR:** ${c.linked_pr_url || '—'}`,
    `- **Data migration:** ${c.data_migration}`,
    `- **Related files:** ${c.related_files || '—'}`,
    '',
    '## Current behavior',
    c.current_behavior || '_(not specified)_',
    '',
    '## Desired behavior',
    c.desired_behavior || '_(not specified)_',
    '',
    '## User flow',
    c.user_flow_steps || '_(not specified)_',
    '',
    '## What this change solves / fixes',
    c.change_solves || '_(not specified)_',
    '',
    '## Acceptance criteria',
    c.acceptance_criteria || '_(not specified)_',
    '',
    '## Out of scope',
    c.out_of_scope || '_(none)_',
    '',
    '## Risk notes',
    c.risk_notes || '_(none)_',
    '',
    '## Demo impact',
    c.demo_impact || '_(none)_',
  ];
  if (attachments.length) {
    lines.push('', '## UI screenshots / attachments');
    for (const a of attachments) {
      lines.push(`- ${a.file_name}${a.url ? ` — ${a.url}` : ` (${a.storage_path})`}`);
    }
  }
  if (reviews.length) {
    lines.push('', '## Team reviews');
    for (const r of reviews) {
      lines.push(
        '',
        `### ${r.reviewer_email} — ${DISPOSITION_LABEL[r.disposition]} (${r.blast_radius})`,
        r.comment || '_(no comment)_',
        r.risks ? `**Risks:** ${r.risks}` : '',
        r.must_preserve ? `**Must preserve:** ${r.must_preserve}` : '',
      );
    }
  }
  return lines.filter((l) => l !== undefined).join('\n');
}

export async function fetchChangeBoard(): Promise<{
  changes: ChangeRequest[];
  reviews: ChangeReview[];
  events: ChangeEvent[];
  attachments: ChangeAttachment[];
  migrationRequired?: boolean;
  error?: string;
}> {
  const res = await fetch('/api/admin/change-requests', { cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return {
      changes: [],
      reviews: [],
      events: [],
      attachments: [],
      error: body?.error ?? 'Failed to load changes',
    };
  }
  const data = (await res.json()) as {
    changes?: ChangeRequest[];
    reviews?: ChangeReview[];
    events?: ChangeEvent[];
    attachments?: ChangeAttachment[];
    migrationRequired?: boolean;
  };
  return {
    changes: data.changes ?? [],
    reviews: data.reviews ?? [],
    events: data.events ?? [],
    attachments: data.attachments ?? [],
    migrationRequired: data.migrationRequired,
  };
}

export async function createChangeRequest(input: ChangeRequestInput): Promise<ChangeRequest | null> {
  const res = await fetch('/api/admin/change-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { change?: ChangeRequest };
  return data.change ?? null;
}

export async function patchChangeRequest(
  id: string,
  patch: Partial<ChangeRequestInput> & { status?: ChangeStatus },
): Promise<ChangeRequest | null> {
  const res = await fetch(`/api/admin/change-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { change?: ChangeRequest };
  return data.change ?? null;
}

export async function submitChangeReview(
  id: string,
  body: {
    disposition: ChangeDisposition;
    comment?: string;
    risks?: string;
    must_preserve?: string;
    blast_radius?: BlastRadius;
  },
): Promise<{ change: ChangeRequest; review: ChangeReview } | null> {
  const res = await fetch(`/api/admin/change-requests/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()) as { change: ChangeRequest; review: ChangeReview };
}

export async function uploadChangeAttachments(
  changeRequestId: string,
  files: File[],
): Promise<ChangeAttachment[]> {
  if (!files.length) return [];
  const form = new FormData();
  for (const file of files) form.append('files', file);
  const res = await fetch(
    `/api/admin/change-requests/${encodeURIComponent(changeRequestId)}/attachments`,
    { method: 'POST', body: form },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { attachments?: ChangeAttachment[] };
  return data.attachments ?? [];
}

export async function deleteChangeAttachment(
  changeRequestId: string,
  attachmentId: string,
): Promise<boolean> {
  const res = await fetch(
    `/api/admin/change-requests/${encodeURIComponent(changeRequestId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: 'DELETE' },
  );
  return res.ok;
}

export type ChangeVerificationResponse = {
  verdict: 'aligned' | 'minor_gaps' | 'blocked';
  checks: { name: string; status: 'pass' | 'warn' | 'gap'; detail: string }[];
  summary: string;
  suggestedRelatedFiles: string[];
  change?: ChangeRequest;
  error?: string;
};

export async function runChangeVerification(
  changeRequestId: string,
): Promise<ChangeVerificationResponse | null> {
  const res = await fetch(
    `/api/admin/change-requests/${encodeURIComponent(changeRequestId)}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persist: true }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return {
      verdict: 'blocked',
      checks: [],
      summary: body?.error ?? 'Verification failed',
      suggestedRelatedFiles: [],
      error: body?.error ?? 'Verification failed',
    };
  }
  return (await res.json()) as ChangeVerificationResponse;
}
