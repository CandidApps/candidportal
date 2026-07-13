import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  getActiveConnectionForUser,
  getActiveSharedConnection,
} from '@/lib/email/zoho-connections';
import {
  getMessageContent,
  searchConversation,
  type ConversationMessage,
} from '@/lib/email/zoho';
import { detectContractInEmailContent, normalizeEmailBodyForDetection } from '@/lib/quotes/detect-supplier-contract';
import { persistSupplierContractArtifact } from '@/lib/quotes/persist-supplier-contract';
import {
  assignContractSubmitAction,
  mapContractSubmitActionRow,
} from '@/lib/services/contract-submit-actions';
import { advanceContractDealStage, insertDealActivityEvent } from '@/lib/services/deal-activity';

export const dynamic = 'force-dynamic';

function splitEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((p) => p.trim().toLowerCase())
    .map((p) => {
      const m = p.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      return (m?.[0] ?? p).toLowerCase();
    })
    .filter((e) => e.includes('@'));
}

function isInboundFromSupplier(msg: ConversationMessage, supplierEmails: Set<string>): boolean {
  const from = msg.fromAddress.trim().toLowerCase();
  if (!from) return false;
  for (const email of supplierEmails) {
    if (from === email || from.includes(email) || email.includes(from)) return true;
  }
  // Domain match only for non-generic business domains when an exact address was stored.
  const GENERIC_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'icloud.com',
    'aol.com',
    'me.com',
  ]);
  for (const email of supplierEmails) {
    const domain = email.split('@')[1];
    if (!domain || GENERIC_DOMAINS.has(domain)) continue;
    if (from.endsWith(`@${domain}`) || from.includes(`@${domain}`)) return true;
  }
  return false;
}

/**
 * Prefer who we actually emailed (compose To / saved supplier_contact_email).
 * Only fall back to the vendor contact directory when no sent address is known.
 */
async function resolveSupplierEmails(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  action: Record<string, unknown>,
): Promise<{ primary: string[]; fallback: string[] }> {
  const primary: string[] = [];
  const seen = new Set<string>();
  const push = (list: string[], raw: string | null | undefined) => {
    for (const e of splitEmails(raw)) {
      if (seen.has(e)) continue;
      seen.add(e);
      list.push(e);
    }
  };

  // 1) Most recent supplier email_sent / status_change with a To address
  const { data: events } = await admin
    .from('deal_activity_events')
    .select('payload, event_type, created_at')
    .eq('contract_submit_action_id', String(action.id))
    .in('event_type', ['email_sent', 'status_change'])
    .order('created_at', { ascending: false })
    .limit(30);

  for (const ev of events ?? []) {
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    const intent = String(payload.intent ?? '');
    const to = typeof payload.to === 'string' ? payload.to : '';
    if (!to.trim()) continue;
    if (
      ev.event_type === 'email_sent' ||
      intent === 'supplier' ||
      payload.note === 'Supplier contract request emailed'
    ) {
      // Prefer non-empty real sends over reconstructed empty placeholders
      push(primary, to);
      break;
    }
  }

  // If newest supplier send had empty `to`, keep scanning older events.
  if (!primary.length) {
    for (const ev of events ?? []) {
      const payload = (ev.payload ?? {}) as Record<string, unknown>;
      const to = typeof payload.to === 'string' ? payload.to : '';
      if (!to.trim()) continue;
      const intent = String(payload.intent ?? '');
      if (ev.event_type === 'email_sent' || intent === 'supplier') {
        push(primary, to);
        break;
      }
    }
  }

  // 2) Saved on the action row (should be the compose To after send)
  push(primary, action.supplier_contact_email as string | null);

  if (primary.length) {
    return { primary, fallback: [] };
  }

  // 3) Last resort: vendor directory contacts (only when we never recorded a To)
  const fallback: string[] = [];
  const vendor = String(action.vendor_name ?? action.service_label ?? '').trim();
  const providerId = action.provider_id ? String(action.provider_id) : '';
  if (providerId || vendor) {
    let providerIds: string[] = providerId ? [providerId] : [];
    if (!providerIds.length && vendor) {
      const { data: providers } = await admin
        .from('solution_providers')
        .select('id')
        .ilike('name', `%${vendor}%`)
        .limit(5);
      providerIds = (providers ?? []).map((p) => String(p.id));
    }
    if (providerIds.length) {
      const { data: contacts } = await admin
        .from('solution_provider_contacts')
        .select('email')
        .in('provider_id', providerIds)
        .not('email', 'is', null)
        .limit(40);
      for (const c of contacts ?? []) {
        push(fallback, c.email as string | null);
      }
    }
  }

  return { primary, fallback };
}

/** POST /api/admin/contract-submit-actions/[id]/check-contract-reply */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let bodyOverride: {
    supplierEmail?: string;
    /** Manually accept a reviewed reply (optionally with a chosen URL). */
    importReply?: {
      messageId?: string;
      folderId?: string;
      from?: string;
      subject?: string;
      body?: string;
      url?: string | null;
      name?: string | null;
      hasAttachment?: boolean;
    };
  } = {};
  try {
    bodyOverride = (await request.json()) as typeof bodyOverride;
  } catch {
    /* no body */
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connection =
    (await getActiveConnectionForUser(user.id)) ?? (await getActiveSharedConnection());
  if (!connection) {
    return NextResponse.json({ error: 'No Zoho mailbox connected' }, { status: 409 });
  }

  const admin = createSupabaseAdminClient();
  const { data: action, error } = await admin
    .from('contract_submit_actions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!action) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const stage = String(action.status);
  if (stage !== 'supplier_contract_requested' && stage !== 'quote_accepted') {
    return NextResponse.json({
      detected: false,
      reason: 'Deal is not waiting on a supplier contract reply',
      action: mapContractSubmitActionRow(action as Record<string, unknown>),
    });
  }

  const siteOrigin = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || null;
    }
  })();

  const advanceFromReply = async (input: {
    from: string;
    subject: string;
    url?: string | null;
    name?: string | null;
    source: 'link' | 'attachment' | 'body';
    excerpt?: string;
    note: string;
    hasAttachment?: boolean;
    messageId?: string | null;
    folderId?: string | null;
  }) => {
    const persisted = await persistSupplierContractArtifact({
      actionId: id,
      crmCustomerExternalId: action.crm_customer_external_id
        ? String(action.crm_customer_external_id)
        : null,
      accountName: (action.account_name as string | null) ?? null,
      vendorName: (action.vendor_name as string | null) ?? null,
      source: input.source,
      url: input.url,
      name: input.name,
      hasAttachment: input.hasAttachment,
      messageId: input.messageId,
      folderId: input.folderId,
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      siteOrigin,
    });

    const result = await advanceContractDealStage({
      actionId: id,
      toStatus: 'supplier_contract_received',
      createdBy: user.id,
      payload: {
        note: input.note,
        from: input.from,
        subject: input.subject,
        source: persisted.source,
        url: persisted.contractUrl,
        name: persisted.contractFilename,
        storagePath: persisted.contractStoragePath,
      },
      extraUpdates: {
        contract_url: persisted.contractUrl,
        contract_filename: persisted.contractFilename,
        contract_storage_path: persisted.contractStoragePath,
        supplier_contact_email:
          (action.supplier_contact_email as string | null) ||
          splitEmails(input.from)[0] ||
          null,
      },
    });

    if (result.error || !result.action) {
      return { error: result.error ?? 'Update failed' as string };
    }

    await insertDealActivityEvent({
      leadId: result.action.lead_id ? String(result.action.lead_id) : null,
      contractSubmitActionId: id,
      eventType: 'email_received',
      fromStatus: stage,
      toStatus: 'supplier_contract_received',
      payload: {
        from: input.from,
        subject: input.subject,
        source: persisted.source,
        url: persisted.contractUrl,
        name: persisted.contractFilename,
        storagePath: persisted.contractStoragePath,
        excerpt: input.excerpt,
        body: input.excerpt,
      },
      createdBy: user.id,
    });

    await assignContractSubmitAction({
      actionId: id,
      userIds: [user.id],
      autoClaim: false,
      actionKind: 'submit_contract_to_customer',
    }).catch(() => undefined);

    return { action: mapContractSubmitActionRow(result.action) };
  };

  // Manual import from a reviewed supplier reply (when auto-detect missed the link).
  if (bodyOverride.importReply) {
    const ir = bodyOverride.importReply;
    const imported = await advanceFromReply({
      from: ir.from?.trim() || 'supplier',
      subject: ir.subject?.trim() || '(no subject)',
      url: ir.url?.trim() || null,
      name: ir.name?.trim() || ir.url?.trim() || 'Imported from supplier email',
      source: ir.url ? 'link' : ir.hasAttachment ? 'attachment' : 'body',
      excerpt: (ir.body ?? '').slice(0, 800),
      note: 'Supplier contract imported from email thread',
      hasAttachment: ir.hasAttachment,
      messageId: ir.messageId ?? null,
      folderId: ir.folderId ?? null,
    });
    if ('error' in imported && imported.error) {
      return NextResponse.json({ error: imported.error }, { status: 500 });
    }
    return NextResponse.json({
      detected: true,
      imported: true,
      action: imported.action,
    });
  }

  const resolved = await resolveSupplierEmails(admin, action as Record<string, unknown>);
  const overrideEmails = splitEmails(bodyOverride.supplierEmail);
  const supplierEmails = overrideEmails.length
    ? overrideEmails
    : resolved.primary.length
      ? resolved.primary
      : resolved.fallback;
  if (!supplierEmails.length) {
    return NextResponse.json({
      detected: false,
      reason:
        'No supplier contact email on file — resend to supplier (so the To address is saved) or mark contract received manually',
      action: mapContractSubmitActionRow(action as Record<string, unknown>),
    });
  }

  // Keep the action row aligned with who we actually emailed.
  const preferredEmail = resolved.primary[0] || supplierEmails[0];
  if (
    preferredEmail &&
    String(action.supplier_contact_email ?? '').trim().toLowerCase() !== preferredEmail
  ) {
    await admin
      .from('contract_submit_actions')
      .update({ supplier_contact_email: preferredEmail })
      .eq('id', id);
  }

  // Prefer the timestamp of the supplier-request email / stage change — not a later
  // metadata touch on the row (which would miss replies that already arrived).
  let sentAt = new Date(String(action.updated_at ?? action.created_at)).getTime();
  const { data: sentEvents } = await admin
    .from('deal_activity_events')
    .select('created_at, event_type, to_status, payload')
    .eq('contract_submit_action_id', id)
    .or('to_status.eq.supplier_contract_requested,event_type.eq.email_sent')
    .order('created_at', { ascending: true })
    .limit(10);
  for (const ev of sentEvents ?? []) {
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    if (
      ev.to_status === 'supplier_contract_requested' ||
      payload.intent === 'supplier' ||
      (ev.event_type === 'email_sent' &&
        payload.intent !== 'customer' &&
        payload.intent !== 'supplier_reply')
    ) {
      const t = new Date(String(ev.created_at)).getTime();
      if (Number.isFinite(t)) {
        sentAt = Math.min(sentAt, t);
        break;
      }
    }
  }

  const accountHint = String(action.account_name ?? action.customer_name ?? '').toLowerCase();

  const byId = new Map<string, ConversationMessage>();
  for (const email of supplierEmails.slice(0, 12)) {
    try {
      const messages = await searchConversation({
        accessToken: connection.accessToken,
        accountId: connection.accountId,
        email,
        limit: 25,
      });
      for (const m of messages) {
        if (!byId.has(m.messageId)) byId.set(m.messageId, m);
      }
    } catch {
      /* try next contact */
    }
  }

  const supplierSet = new Set(supplierEmails);
  const candidates = [...byId.values()]
    .filter((m) => m.receivedTime >= sentAt - 60_000)
    .filter((m) => isInboundFromSupplier(m, supplierSet))
    .sort((a, b) => b.receivedTime - a.receivedTime);

  // Prefer replies that mention the account / contract.
  const ranked = candidates.sort((a, b) => {
    const score = (m: ConversationMessage) => {
      let s = 0;
      const hay = `${m.subject}\n${m.summary}`.toLowerCase();
      if (accountHint && hay.includes(accountHint.slice(0, 12).toLowerCase())) s += 3;
      if (/\bcontract|agreement|sign\b/i.test(hay)) s += 2;
      if (m.hasAttachment) s += 2;
      return s;
    };
    return score(b) - score(a);
  });

  const reply = ranked[0];
  if (!reply) {
    return NextResponse.json({
      detected: false,
      reason: `No inbound supplier reply found yet (searched ${supplierEmails.length} contact(s))`,
      searchedEmails: supplierEmails.slice(0, 8),
      action: mapContractSubmitActionRow(action as Record<string, unknown>),
    });
  }

  let body = reply.summary;
  try {
    const content = await getMessageContent({
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      messageId: reply.messageId,
      folderId: reply.folderId,
    });
    if (content?.trim()) body = content;
  } catch {
    /* use summary */
  }

  const normalized = normalizeEmailBodyForDetection(body);
  const found = detectContractInEmailContent({
    subject: reply.subject,
    body,
    hasAttachment: reply.hasAttachment,
  });

  const replyPreview = {
    messageId: reply.messageId,
    folderId: reply.folderId,
    from: reply.fromAddress,
    subject: reply.subject,
    hasAttachment: reply.hasAttachment,
    receivedAt: reply.receivedTime
      ? new Date(reply.receivedTime).toISOString()
      : null,
    bodyText: normalized.text,
    bodyHtml: body,
    links: normalized.links,
  };

  if (!found) {
    return NextResponse.json({
      detected: false,
      reason:
        'Supplier replied, but no contract link/attachment was auto-detected. Review the email below and import it.',
      reply: replyPreview,
      searchedEmails: supplierEmails.slice(0, 8),
      action: mapContractSubmitActionRow(action as Record<string, unknown>),
    });
  }

  const advanced = await advanceFromReply({
    from: reply.fromAddress,
    subject: reply.subject,
    url: found.url ?? null,
    name: found.name ?? null,
    source: found.source,
    excerpt: found.excerpt,
    note: 'Supplier contract detected in email',
    hasAttachment: reply.hasAttachment,
    messageId: reply.messageId,
    folderId: reply.folderId,
  });

  if ('error' in advanced && advanced.error) {
    return NextResponse.json({ error: advanced.error }, { status: 500 });
  }

  return NextResponse.json({
    detected: true,
    contract: found,
    reply: replyPreview,
    action: advanced.action,
  });
}
