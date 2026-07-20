import type { CandidContractRecord } from '@/lib/customer-records';
import type { CustomerAction, CustomerPortalData } from '@/lib/portal-import/merge';

/** Lightweight page/screen awareness for the global admin Ask Hank panel. */
export type AdminHankPageContext = {
  /** Current admin nav view key (customers, commissions, messages, …). */
  view: string;
  viewLabel: string;
  customer?: {
    id: string;
    company: string;
    status: string;
    agent?: string;
    industry?: string;
    website?: string;
    spend?: number;
    notes?: string;
    portal?: CustomerPortalData;
    openActions?: CustomerAction[];
    contracts?: CandidContractRecord[];
    primaryContact?: { name: string; email?: string; phone?: string; role?: string };
  };
};

export const ADMIN_HANK_BASE_PROMPT = `You are Hank, the admin AI assistant inside the Candid Intelligence Platform.

You help Candid staff across the portal: customer accounts, renewals and optimizations, research and recommendations, commissions (supplier imports, agent payouts, bank deposits, deal master), action center tickets, marketing, and day-to-day workflow questions.

## YOUR PERSONALITY
Sharp, concise, and practical. No filler. Speak like an experienced Candid teammate.

## PAGE / CONTEXT AWARENESS
- You may receive a "Current screen" block describing what the user is looking at.
- When a customer account is in focus, assume questions refer to THAT customer unless they clearly name a different company, topic, or ask something global (e.g. commissions workflow, another account by name).
- You can still answer questions about other customers, commissions, portal navigation, or general process — do not refuse just because an account is in focus.
- Be honest when you lack live numbers or full CRM detail; say what screen to check.

## COMMISSIONS (when relevant)
Monthly workflow order: Bank Deposits → Supplier Reports → Expenses → Agent Payments.
Unmatched commission rows: Commissions → Supplier reports → New Deal(s).
Missing reports: zero-total suppliers → Manual upload.

## RULES
1. Keep responses to 2–4 short paragraphs unless asked for detail.
2. Use light HTML: <strong>, <br>, <ul>, <li>.
3. You are speaking to Candid admin users — internal economics and operations are fine to discuss.
4. Prefer actionable next steps over generic advice.`;

const VIEW_LABELS: Record<string, string> = {
  assistant: 'My Assistant',
  customers: 'Accounts',
  leads: 'Leads',
  agents: 'Agents',
  commissions: 'Commissions',
  expenses: 'Expenses',
  marketinghub: 'Marketing Hub',
  adminsettings: 'Admin Settings',
  partners: 'Partners',
  messages: 'Message Center',
  actions: 'Action Center',
  custmessages: 'Customer Inbox',
};

export function adminViewLabel(view: string): string {
  return VIEW_LABELS[view] ?? view;
}

export function buildAdminHankGreeting(ctx?: AdminHankPageContext | null): string {
  const company = ctx?.customer?.company?.trim();
  if (company) {
    return `How can I help you with <strong>${company}</strong>? Ask about this account, or anything else across Candid.`;
  }
  if (ctx?.viewLabel) {
    return `Hi — I'm Hank. You're on <strong>${ctx.viewLabel}</strong>. Ask about this screen, customers, commissions, or anything else in Candid.`;
  }
  return "Hi — I'm Hank, your Candid assistant. Ask about customers, research, commissions, agent payouts, deposits, deals, and more.";
}

export function buildAdminHankSubtitle(ctx?: AdminHankPageContext | null): string {
  const company = ctx?.customer?.company?.trim();
  if (company) return `Focused on ${company} — you can still ask about anything else`;
  if (ctx?.viewLabel) return `On ${ctx.viewLabel} — customers, research, commissions, portal actions`;
  return 'Ask anything — customers, research, commissions, or portal actions';
}

export function getAdminHankSuggestions(ctx?: AdminHankPageContext | null): string[] {
  if (ctx?.customer) {
    const hasRenewal = ctx.customer.openActions?.some((a) => a.kind === 'renewal');
    const list = [
      'What should I prioritize for this account?',
      'Draft a renewal outreach email',
    ];
    if (hasRenewal) list.push('Help me close the open renewal action');
    list.push('Summarize open contracts on this account');
    return list;
  }
  if (ctx?.view === 'commissions') {
    return [
      'Summarize what I should check this month',
      'How do I add a new deal for an unmatched commission row?',
      'Open bank deposits reconciliation',
      'Which agents have unpaid commissions?',
    ];
  }
  return [
    'Summarize what I should check this month',
    'How do I add a new deal for an unmatched commission row?',
    'Open bank deposits reconciliation',
    'Which agents have unpaid commissions?',
    'Import Vendara commissions for June',
  ];
}

export function formatTrainingForPrompt(
  items: { subject: string; info: string; scope?: string }[],
): string {
  if (!items.length) return '';
  const lines = items.map((c) => `- [${c.scope ?? 'personal'}] ${c.subject}: ${c.info}`);
  return `## Things you remember (training / memory)\n${lines.join('\n')}`;
}

export function buildAdminHankSystemPrompt(
  ctx: AdminHankPageContext | null | undefined,
  extras?: { trainingPrompt?: string; guidesPrompt?: string; sourcesPrompt?: string },
): string {
  const lines: string[] = [ADMIN_HANK_BASE_PROMPT, '', '## Current screen'];
  lines.push(`- View: ${ctx?.viewLabel ?? 'Admin portal'}`);

  const customer = ctx?.customer;
  if (customer) {
    lines.push(`- Customer in focus: ${customer.company}`);
    lines.push(`- Account ID: ${customer.id}`);
    lines.push(`- Status: ${customer.status}`);
    if (customer.agent) lines.push(`- Agent: ${customer.agent}`);
    if (customer.industry) lines.push(`- Industry: ${customer.industry}`);
    if (customer.website) lines.push(`- Website: ${customer.website}`);
    if (typeof customer.spend === 'number') lines.push(`- Monthly spend (CRM): $${customer.spend}`);
    if (customer.notes?.trim()) lines.push(`- Notes: ${customer.notes.trim().slice(0, 500)}`);
    if (customer.primaryContact) {
      const pc = customer.primaryContact;
      lines.push(
        `- Primary contact: ${pc.name}${pc.role ? ` (${pc.role})` : ''}${pc.email ? ` · ${pc.email}` : ''}${pc.phone ? ` · ${pc.phone}` : ''}`,
      );
    }
    if (customer.portal?.displayName) lines.push(`- Portal display name: ${customer.portal.displayName}`);
    if (customer.portal?.totalCandidMrc) {
      lines.push(`- Total Candid MRC: $${customer.portal.totalCandidMrc}/mo`);
    }
    if (customer.portal?.salesPitch?.opening) {
      lines.push('', '## Portal talking point', customer.portal.salesPitch.opening);
    }

    const openActions = customer.openActions ?? [];
    if (openActions.length) {
      lines.push('', '## Open account actions');
      for (const a of openActions.slice(0, 20)) {
        lines.push(
          `- [${a.id}] ${a.severity.toUpperCase()} ${a.kind}: ${a.title}${a.provider ? ` (${a.provider})` : ''}${a.dueDate ? ` — due ${a.dueDate}` : ''}`,
        );
        if (a.detail) lines.push(`  Detail: ${a.detail}`);
      }
    } else {
      lines.push('', '## Open account actions', 'None on file (or not loaded for this session).');
    }

    const contracts = customer.contracts ?? [];
    if (contracts.length) {
      lines.push('', '## Active contracts');
      for (const c of contracts.slice(0, 12)) {
        const end = c.contractEndDate ? ` ends ${c.contractEndDate}` : '';
        const mrc = c.mrc ?? c.monthly;
        lines.push(
          `- ${c.solution ?? c.vendor}: ${c.product ?? c.service ?? 'Service'} — $${mrc ?? 0}/mo (${c.dealStatus})${end}`,
        );
      }
    }
  } else {
    lines.push('- No customer account in focus');
  }

  if (extras?.trainingPrompt?.trim()) {
    lines.push('', extras.trainingPrompt.trim());
  }

  let prompt = lines.join('\n');
  if (extras?.guidesPrompt?.trim()) {
    prompt = `${prompt}\n\n${extras.guidesPrompt.trim()}`;
  }
  if (extras?.sourcesPrompt?.trim()) {
    prompt = `${prompt}\n\n${extras.sourcesPrompt.trim()}`;
  }
  return prompt;
}
