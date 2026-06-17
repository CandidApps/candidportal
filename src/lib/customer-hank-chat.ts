import type { CandidContractRecord } from '@/lib/customer-records';
import type { ActionResolutionOutcome } from '@/lib/customer-actions-store';
import type { CustomerAction, CustomerPortalData } from '@/lib/portal-import/merge';
import type { CustomActionDraft } from '@/components/customers/AddCustomActionModal';

export type CustomerHankContext = {
  id: string;
  company: string;
  status: string;
  portal?: CustomerPortalData;
};

export const CUSTOMER_HANK_BASE_PROMPT = `You are Hank, the Candid admin AI assistant embedded on a customer account page.
You help account managers handle renewals, optimizations, contract updates, and customer follow-ups.
Be concise, actionable, and professional. Draft customer emails when asked.
You may use light HTML (<strong>, <ul>, <li>, <p>) for readability.

IMPORTANT CONTEXT RULES:
- The user is viewing a specific customer account. Unless they explicitly name a different customer, assume ALL questions refer to this customer.
- When they mention a provider (e.g. "Comcast contract was renewed"), tie it to this customer's open actions and contracts.
- Ask clarifying follow-up questions when needed (new term dates, MRC, outcome).

STRUCTURED ACTIONS — when the user wants to close/resolve an action or add a custom action, include a machine-readable block AFTER your conversational reply:

To resolve/close an open action:
\`\`\`action-resolve
{"actionId":"optional-id","actionTitle":"match by title if needed","outcome":"renewed|cancelled|deferred|no_change|completed|other","notes":"summary of what happened","contractUpdates":{"provider":"optional","mrc":142.95,"contractEndDate":"2028-03-15"}}
\`\`\`

To add a custom action:
\`\`\`action-add
{"title":"...","detail":"...","severity":"urgent|soon|info","kind":"renewal|optimization|custom","suggestedAction":"...","dueDate":"YYYY-MM-DD","provider":"optional"}
\`\`\`

Only include these blocks when you have enough information or the user explicitly asks to close/add an action. Otherwise just converse and gather details.`;

export type HankActionResolvePayload = {
  actionId?: string;
  actionTitle?: string;
  outcome: ActionResolutionOutcome;
  notes?: string;
  contractUpdates?: {
    provider?: string;
    product?: string;
    mrc?: number;
    contractStartDate?: string;
    contractEndDate?: string;
    paySource?: string;
    dealId?: string;
  };
};

export type HankActionAddPayload = Partial<CustomActionDraft> & { title: string };

export type ParsedHankBlocks = {
  resolve?: HankActionResolvePayload;
  add?: HankActionAddPayload;
  displayText: string;
};

function extractJsonBlock(text: string, tag: string): { json: string; rest: string } | null {
  const re = new RegExp(`\`\`\`${tag}\\s*([\\s\\S]*?)\\s*\`\`\``, 'i');
  const match = text.match(re);
  if (!match) return null;
  return {
    json: match[1]!.trim(),
    rest: text.replace(match[0], '').trim(),
  };
}

export function parseHankActionBlocks(text: string): ParsedHankBlocks {
  let displayText = text;
  let resolve: HankActionResolvePayload | undefined;
  let add: HankActionAddPayload | undefined;

  const resolveBlock = extractJsonBlock(displayText, 'action-resolve');
  if (resolveBlock) {
    displayText = resolveBlock.rest;
    try {
      resolve = JSON.parse(resolveBlock.json) as HankActionResolvePayload;
    } catch {
      resolve = undefined;
    }
  }

  const addBlock = extractJsonBlock(displayText, 'action-add');
  if (addBlock) {
    displayText = addBlock.rest;
    try {
      add = JSON.parse(addBlock.json) as HankActionAddPayload;
    } catch {
      add = undefined;
    }
  }

  return { resolve, add, displayText: displayText.trim() };
}

export function findActionForHankResolve(
  openActions: CustomerAction[],
  payload: HankActionResolvePayload,
): CustomerAction | undefined {
  if (payload.actionId) {
    return openActions.find((a) => a.id === payload.actionId);
  }
  if (payload.actionTitle) {
    const key = payload.actionTitle.toLowerCase();
    return openActions.find(
      (a) =>
        a.title.toLowerCase().includes(key) ||
        key.includes(a.title.toLowerCase().slice(0, 20)),
    );
  }
  if (payload.contractUpdates?.provider) {
    const p = payload.contractUpdates.provider.toLowerCase();
    return openActions.find(
      (a) =>
        a.provider?.toLowerCase().includes(p) ||
        a.title.toLowerCase().includes(p),
    );
  }
  return undefined;
}

export function getCustomerHankSuggestions(customer: CustomerHankContext): string[] {
  const hasRenewal = customer.portal?.actions.some((a) => a.kind === 'renewal');
  const suggestions = [
    'What should I prioritize for this account?',
    'Draft a renewal outreach email',
  ];
  if (hasRenewal) {
    suggestions.push('The contract was renewed — help me close this action');
  }
  suggestions.push('Add a follow-up action for next month');
  return suggestions;
}

export function buildCustomerHankSystemPrompt(
  customer: CustomerHankContext,
  openActions: CustomerAction[],
  contracts: CandidContractRecord[],
  portal?: CustomerPortalData,
): string {
  const lines: string[] = [
    CUSTOMER_HANK_BASE_PROMPT,
    '',
    '## Current screen',
    `- Customer: ${customer.company}`,
    `- Account ID: ${customer.id}`,
    `- Status: ${customer.status}`,
  ];

  if (portal?.displayName) lines.push(`- Display name: ${portal.displayName}`);
  if (portal?.totalCandidMrc) lines.push(`- Total Candid MRC: $${portal.totalCandidMrc}/mo`);
  if (portal?.salesPitch?.opening) {
    lines.push('', '## Portal talking point', portal.salesPitch.opening);
  }

  if (openActions.length) {
    lines.push('', '## Open account actions');
    for (const a of openActions) {
      lines.push(
        `- [${a.id}] ${a.severity.toUpperCase()} ${a.kind}: ${a.title}${a.provider ? ` (${a.provider})` : ''}${a.dueDate ? ` — due ${a.dueDate}` : ''}`,
      );
      lines.push(`  Detail: ${a.detail}`);
    }
  } else {
    lines.push('', '## Open account actions', 'None — all actions are closed or none on file.');
  }

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

  lines.push(
    '',
    'When the user describes closing an action (renewed, cancelled, etc.), ask for missing dates/MRC if needed, then emit an action-resolve block they can apply.',
  );

  return lines.join('\n');
}
