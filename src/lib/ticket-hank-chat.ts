import type { AdminTicketKind, UnifiedAdminTicket } from '@/lib/admin-tickets';
import { TICKET_KIND_LABEL } from '@/lib/admin-tickets';
import type { CustomerPortalData } from '@/lib/portal-import/merge';
import type { TicketAgentBrief, TicketAgentInput } from '@/lib/ticket-action-agent';

export const TICKET_HANK_BASE_PROMPT = `You are Hank, the Candid admin AI assistant embedded in the Action Center.
You help account managers handle customer actions: renewals, savings opportunities, service tickets, statement reviews, and analysis questions.
Be concise, actionable, and professional. Draft customer emails when asked. Suggest timelines, negotiation angles, and next steps.
You may use light HTML (<strong>, <ul>, <li>, <p>) for readability. One light quip at most when appropriate.`;

export function findPortalCustomerForTicket(
  ticket: UnifiedAdminTicket,
  customers: { company: string; portal?: CustomerPortalData }[],
): CustomerPortalData | undefined {
  const match = customers.find(
    (c) =>
      c.company === ticket.customerName ||
      c.portal?.displayName === ticket.customerName ||
      c.portal?.bmwMerchantName === ticket.customerName,
  );
  return match?.portal;
}

export function getTicketHankSuggestions(kind: AdminTicketKind): string[] {
  switch (kind) {
    case 'renewal':
      return [
        'Draft a renewal outreach email',
        'What is our negotiation leverage?',
        'Timeline and milestones for this renewal',
      ];
    case 'optimization':
      return [
        'How should I pitch this savings opportunity?',
        'Draft customer talking points',
        'What data should I gather before outreach?',
      ];
    case 'statement':
      return [
        'Summarize the main fee issues',
        'Draft a findings email to the merchant',
        'Is this rate worth escalating?',
      ];
    case 'analysis':
      return [
        'Help me answer the customer question',
        'Draft a clear reply email',
        'What should I verify before responding?',
      ];
    case 'service':
      return [
        'What are the best next steps?',
        'Draft a reply to the customer',
        'Which vendor portal should I use?',
      ];
    default:
      return ['What should I do next?', 'Draft a customer email'];
  }
}

export function buildTicketHankSystemPrompt(
  ticket: UnifiedAdminTicket,
  input: TicketAgentInput,
  brief: TicketAgentBrief,
  portal?: CustomerPortalData,
): string {
  const lines: string[] = [TICKET_HANK_BASE_PROMPT, '', '## Current action'];

  lines.push(`- Type: ${TICKET_KIND_LABEL[ticket.kind]}`);
  lines.push(`- Customer: ${ticket.customerName}`);
  if (ticket.customerEmail) lines.push(`- Email: ${ticket.customerEmail}`);
  lines.push(`- Title: ${ticket.title}`);
  lines.push(`- Detail: ${ticket.detail}`);
  if (input.serviceName) lines.push(`- Service: ${input.serviceName}`);
  if (input.subject) lines.push(`- Subject: ${input.subject}`);
  if (input.message) lines.push(`- Customer message:\n${input.message}`);
  if (input.question) lines.push(`- Analysis question:\n${input.question}`);
  if (input.fileName) lines.push(`- Statement file: ${input.fileName}`);
  if (input.statementPreview) {
    const p = input.statementPreview;
    lines.push(
      `- Statement preview: ${p.processor}, ${p.statementDate}, ${p.effectiveRate}% effective rate, ${p.totalVolume} volume`,
    );
  }

  lines.push('', '## Initial playbook recommendations');
  lines.push(brief.summary);
  for (const r of brief.reasoning) lines.push(`- ${r}`);
  for (const a of brief.suggestedActions) {
    lines.push(`- Suggested action: ${a.label}${a.description ? ` (${a.description})` : ''}`);
  }

  if (portal) {
    lines.push('', '## Customer portfolio context');
    if (portal.totalCandidMrc != null) {
      lines.push(`- Total Candid MRC: $${portal.totalCandidMrc}`);
    }
    if (portal.billingCycle) lines.push(`- Billing cycle: ${portal.billingCycle}`);
    if (portal.financialNotes) lines.push(`- Financial notes: ${portal.financialNotes}`);
    if (portal.salesPitch?.opening) {
      lines.push(`- Sales pitch opening: ${portal.salesPitch.opening}`);
    }
    for (const r of portal.renewalAlerts.slice(0, 6)) {
      const days =
        r.daysUntilRenewal != null ? `, ${r.daysUntilRenewal} days out` : '';
      lines.push(`- Renewal alert: ${r.provider} ends ${r.renewalDate}${days}`);
      if (r.note) lines.push(`  Note: ${r.note}`);
    }
    for (const o of portal.optimizations.slice(0, 6)) {
      lines.push(
        `- Optimization (${o.type}): ${o.detail}${o.potentialImpact ? ` — impact: ${o.potentialImpact}` : ''}`,
      );
    }
  }

  return lines.join('\n');
}
