import type { AdminTicketKind } from '@/lib/admin-tickets';
import type { DemoStatementPreview } from '@/lib/demo/admin-portfolio';

export type TicketActionKind =
  | 'link'
  | 'resolve'
  | 'mark_reviewed'
  | 'in_progress'
  | 'email_customer'
  | 'open_analysis';

export type TicketAction = {
  id: string;
  label: string;
  description?: string;
  href?: string;
  external?: boolean;
  variant?: 'primary' | 'default';
  kind: TicketActionKind;
};

export type TicketAgentBrief = {
  headline: string;
  summary: string;
  reasoning: string[];
  suggestedActions: TicketAction[];
};

export type TicketAgentInput = {
  kind: AdminTicketKind;
  title: string;
  detail: string;
  customerName: string;
  customerEmail: string;
  serviceName?: string;
  subject?: string;
  message?: string;
  question?: string;
  statementPreview?: DemoStatementPreview;
  fileName?: string;
};

const VONAGE_ADD_USER_SUPPORT =
  'https://businesssupport.vonage.com/answerslist?kw=add+user';

function norm(s: string) {
  return s.toLowerCase();
}

function corpus(input: TicketAgentInput): string {
  return norm(
    [
      input.title,
      input.detail,
      input.serviceName,
      input.subject,
      input.message,
      input.question,
      input.fileName,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function pushLink(
  actions: TicketAction[],
  id: string,
  label: string,
  href: string,
  opts?: { description?: string; primary?: boolean },
) {
  if (actions.some((a) => a.id === id)) return;
  actions.push({
    id,
    label,
    href,
    external: true,
    variant: opts?.primary ? 'primary' : 'default',
    description: opts?.description,
    kind: 'link',
  });
}

export function getTicketAgentBrief(input: TicketAgentInput): TicketAgentBrief {
  const text = corpus(input);
  const actions: TicketAction[] = [];
  const reasoning: string[] = [];

  if (input.kind === 'statement' && input.statementPreview) {
    const p = input.statementPreview;
    reasoning.push(
      `Uploaded statement for ${input.customerName} shows ${p.effectiveRate}% effective rate on ${p.statementDate} processing.`,
    );
    if (p.effectiveRate >= 2.5) {
      reasoning.push('Effective rate is above typical Candid portfolio targets — pricing review may unlock savings.');
    }
    for (const h of p.highlights.slice(0, 2)) {
      reasoning.push(h);
    }
    actions.push({
      id: 'stmt-run-analysis',
      label: 'Open merchant analysis',
      description: 'Compare fees against Candid pricing rules',
      kind: 'open_analysis',
      variant: 'primary',
    });
    actions.push({
      id: 'stmt-email-customer',
      label: 'Email customer summary',
      description: input.customerEmail || 'Add email on file',
      kind: 'email_customer',
    });
    actions.push({
      id: 'stmt-mark-reviewed',
      label: 'Mark statement reviewed',
      kind: 'mark_reviewed',
    });

    return {
      headline: 'Statement review',
      summary:
        'Review the uploaded statement preview, confirm fee anomalies, then run analysis or reply to the merchant with findings.',
      reasoning,
      suggestedActions: actions,
    };
  }

  if (input.kind === 'renewal') {
    reasoning.push('Contract renewal window — proactive outreach before the alert date reduces churn and improves negotiation position.');
    if (input.detail) {
      reasoning.push(input.detail.length > 180 ? `${input.detail.slice(0, 180)}…` : input.detail);
    }
    actions.push({
      id: 'renewal-email',
      label: 'Draft renewal outreach',
      description: input.customerEmail || 'Add email on file',
      kind: 'email_customer',
      variant: 'primary',
    });
    actions.push({
      id: 'renewal-in-progress',
      label: 'Set in progress',
      kind: 'in_progress',
    });
    actions.push({
      id: 'renewal-resolve',
      label: 'Mark handled',
      kind: 'resolve',
    });

    return {
      headline: 'Contract renewal',
      summary:
        'Start renewal conversations early — confirm contract terms, gather usage data, and position Candid value before the provider reaches out.',
      reasoning,
      suggestedActions: actions,
    };
  }

  if (input.kind === 'optimization') {
    reasoning.push('Identified savings or upgrade opportunity — tie the pitch to measurable impact and current spend.');
    if (input.detail) {
      reasoning.push(input.detail.length > 180 ? `${input.detail.slice(0, 180)}…` : input.detail);
    }
    actions.push({
      id: 'opt-email',
      label: 'Email savings pitch',
      description: input.customerEmail || 'Add email on file',
      kind: 'email_customer',
      variant: 'primary',
    });
    actions.push({
      id: 'opt-resolve',
      label: 'Mark handled',
      kind: 'resolve',
    });

    return {
      headline: 'Savings opportunity',
      summary:
        'Use portfolio context to quantify savings, then reach out with a clear recommendation and optional call to review.',
      reasoning,
      suggestedActions: actions,
    };
  }

  if (input.kind === 'analysis') {
    reasoning.push('Customer asked a question from merchant analysis — specialist follow-up recommended.');
    if (input.question) reasoning.push(`Question: “${input.question.slice(0, 120)}${input.question.length > 120 ? '…' : ''}”`);
    actions.push({
      id: 'analysis-open',
      label: 'Open analysis workspace',
      kind: 'open_analysis',
      variant: 'primary',
    });
    actions.push({
      id: 'analysis-email',
      label: 'Reply to customer',
      kind: 'email_customer',
    });
    actions.push({
      id: 'analysis-resolve',
      label: 'Mark resolved',
      kind: 'resolve',
    });

    return {
      headline: 'Analysis question',
      summary: 'Use the analysis context to answer the merchant, or escalate to payments ops if rates/contracts are involved.',
      reasoning,
      suggestedActions: actions,
    };
  }

  // Service ticket heuristics
  const service = norm(input.serviceName ?? '');

  if (service.includes('vonage') || text.includes('vonage')) {
    reasoning.push('Ticket references Vonage — likely UCaaS admin or provisioning.');
    pushLink(actions, 'vonage-admin', 'Open Vonage admin portal', 'https://admin.vonage.com/', {
      description: 'Account & user management',
      primary: true,
    });
    if (
      /add\s*(a\s*)?user|new\s*user|user\s*add|add\s*extension|new\s*extension|phone\s*user/.test(text)
    ) {
      reasoning.push('Request mentions adding a user — Vonage support guide for add-user is the fastest path.');
      pushLink(
        actions,
        'vonage-add-user-guide',
        'How to add a user (Vonage support)',
        VONAGE_ADD_USER_SUPPORT,
        { description: 'Interactive add/remove user guide' },
      );
    }
  }

  if (service.includes('ringcentral') || text.includes('ringcentral')) {
    reasoning.push('RingCentral service ticket — check admin portal for user/license changes.');
    pushLink(actions, 'rc-admin', 'Open RingCentral admin', 'https://service.ringcentral.com/', { primary: true });
    if (/add\s*user|new\s*user/.test(text)) {
      pushLink(
        actions,
        'rc-add-user',
        'Add user help (RingCentral)',
        'https://support.ringcentral.com/article-v2/Adding-users-via-the-RingCentral-app.html',
      );
    }
  }

  if (/pci|compliance|saq/.test(text)) {
    reasoning.push('PCI/compliance language detected — verify SAQ status and processor compliance fees.');
    actions.push({
      id: 'pci-email',
      label: 'Send PCI checklist to customer',
      kind: 'email_customer',
      variant: actions.length ? 'default' : 'primary',
    });
  }

  if (/cancel|termination|close\s*account/.test(text)) {
    reasoning.push('Cancellation intent — confirm contract term, ETF, and notice window before processing.');
    actions.push({
      id: 'svc-in-progress',
      label: 'Set in progress',
      kind: 'in_progress',
      variant: 'primary',
    });
  }

  if (/billing|invoice|charge|refund/.test(text)) {
    reasoning.push('Billing dispute or invoice question — pull latest statement and contract tier.');
    actions.push({
      id: 'svc-statement',
      label: 'Request latest statement',
      kind: 'email_customer',
    });
  }

  if (!actions.length) {
    reasoning.push('No playbook match yet — use ticket message and service name to choose next steps.');
    actions.push({
      id: 'svc-email',
      label: 'Email customer',
      kind: 'email_customer',
      variant: 'primary',
    });
    actions.push({
      id: 'svc-in-progress',
      label: 'Set in progress',
      kind: 'in_progress',
    });
  }

  if (!actions.some((a) => a.kind === 'email_customer')) {
    actions.unshift({
      id: 'svc-email-always',
      label: 'Email customer',
      kind: 'email_customer',
      variant: 'default',
    });
  }

  actions.push({
    id: 'svc-resolve',
    label: 'Mark resolved',
    kind: 'resolve',
  });

  return {
    headline: input.serviceName ? `${input.serviceName} ticket` : 'Service ticket',
    summary:
      'Hank suggests these actions based on the ticket text. You can refine playbooks over time as you add more vendor data.',
    reasoning,
    suggestedActions: actions,
  };
}
