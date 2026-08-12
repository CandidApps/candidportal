/** Admin Frank: propose CRM record adds (contacts) → human approve before persist. */

export type AdminRecordTarget = 'account' | 'lead' | 'outreach' | 'partner';

export type AdminRecordContactDraft = {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  altEmail?: string;
  isPrimary?: boolean;
  notes?: string;
};

export type AdminRecordAddProposal = {
  /** Unique id for UI approval state (client-assigned). */
  proposalId: string;
  target: AdminRecordTarget;
  /** External/customer id, portal lead uuid, partner_suppliers id, etc. */
  targetId?: string;
  /** Human label Frank resolved (company / partner / lead name). */
  targetLabel: string;
  contacts: AdminRecordContactDraft[];
  /** Outreach-only: tag names to apply when linking. */
  outreachTagNames?: string[];
  /** Outreach-only: set first contact as the outreach account contact. */
  setAsOutreachContact?: boolean;
};

export const ADMIN_RECORD_ACTIONS_PROMPT = `
## RECORD ADDS (ADMIN ONLY — REQUIRES USER APPROVAL)
You can propose adding contacts to: Accounts, Leads, Partners (suppliers), and Outreach.
You MUST NOT claim you already added anything. Always propose, summarize clearly, and wait for the user to click Approve in the UI.

When the user pastes a list of people or asks you to add contacts:
1. Confirm the target (which account / lead / partner / outreach company). Use your database tools to look up the correct id when needed.
2. Parse every contact you can (name, email, phone, role). Ask clarifying questions only if the target is ambiguous or a row has no name and no email.
3. In your reply, briefly list what you will add (target + each person).
4. AFTER your conversational reply, emit ONE machine-readable block:

\`\`\`action-add-record
{
  "target": "account" | "lead" | "partner" | "outreach",
  "targetId": "id if known (customer external_id, portal lead uuid, or solution_providers numeric id as string)",
  "targetLabel": "Company or partner display name",
  "contacts": [
    {"name":"Jane Doe","email":"jane@co.com","phone":"555-0100","role":"IT Director","isPrimary":false}
  ],
  "outreachTagNames": ["optional"],
  "setAsOutreachContact": false
}
\`\`\`

Rules:
- Only for account / lead / partner / outreach — never invent other target types.
- For partners/suppliers/vendors: look up \`solution_providers\` (Partners tab), NOT \`partner_suppliers\` (that table is commission/bank deposit partners only and will miss vendors like GoTo). Use solution_providers.id as targetId.
- For outreach: targetId should be the CRM customer external_id for that outreach account; contacts are saved on the account, then optionally linked on the outreach row.
- Prefer one block with many contacts over many blocks when the user pastes a list.
- If you cannot resolve targetId, still include targetLabel so the user can correct before approving.
- Do NOT include action-add-record unless the user asked to add/save contacts (or clearly wants them entered).
`.trim();

function extractAllJsonBlocks(text: string, tag: string): { json: string; fullMatch: string }[] {
  const re = new RegExp(`\`\`\`${tag}\\s*([\\s\\S]*?)\\s*\`\`\``, 'gi');
  const out: { json: string; fullMatch: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) != null) {
    out.push({ json: match[1]!.trim(), fullMatch: match[0] });
  }
  return out;
}

function normalizeContact(raw: unknown): AdminRecordContactDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name = String(row.name ?? '').trim();
  const email = String(row.email ?? '').trim();
  if (!name && !email) return null;
  return {
    name: name || email,
    email: email || undefined,
    phone: String(row.phone ?? '').trim() || undefined,
    role: String(row.role ?? row.title ?? '').trim() || undefined,
    altEmail: String(row.altEmail ?? '').trim() || undefined,
    isPrimary: Boolean(row.isPrimary),
    notes: String(row.notes ?? '').trim() || undefined,
  };
}

function parseOneProposal(json: string, index: number): AdminRecordAddProposal | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const target = String(raw.target ?? '').trim().toLowerCase();
    if (target !== 'account' && target !== 'lead' && target !== 'partner' && target !== 'outreach') {
      return null;
    }
    const contactsRaw = Array.isArray(raw.contacts)
      ? raw.contacts
      : raw.contact
        ? [raw.contact]
        : [];
    const contacts = contactsRaw
      .map(normalizeContact)
      .filter((c): c is AdminRecordContactDraft => Boolean(c));
    if (!contacts.length) return null;

    const tagNames = Array.isArray(raw.outreachTagNames)
      ? raw.outreachTagNames.map((t) => String(t).trim()).filter(Boolean)
      : undefined;

    return {
      proposalId: `prop-${Date.now()}-${index}`,
      target: target as AdminRecordTarget,
      targetId: String(raw.targetId ?? '').trim() || undefined,
      targetLabel: String(raw.targetLabel ?? raw.targetName ?? target).trim() || target,
      contacts,
      outreachTagNames: tagNames,
      setAsOutreachContact: Boolean(raw.setAsOutreachContact),
    };
  } catch {
    return null;
  }
}

export function parseAdminRecordActionBlocks(text: string): {
  displayText: string;
  proposals: AdminRecordAddProposal[];
} {
  const blocks = extractAllJsonBlocks(text, 'action-add-record');
  let displayText = text;
  const proposals: AdminRecordAddProposal[] = [];
  blocks.forEach((block, i) => {
    displayText = displayText.replace(block.fullMatch, '').trim();
    const proposal = parseOneProposal(block.json, i);
    if (proposal) proposals.push(proposal);
  });
  return { displayText: displayText.trim(), proposals };
}

export async function applyAdminRecordProposal(
  proposal: AdminRecordAddProposal,
): Promise<{ message: string }> {
  const res = await fetch('/api/admin/hank/apply-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proposal),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to apply record');
  return { message: data.message ?? 'Saved.' };
}
