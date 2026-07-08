import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { askHankServer } from '@/lib/hank/server';
import { getMessageContent, searchConversation } from '@/lib/email/zoho';
import {
  getActiveConnectionForUser,
  getActiveSharedConnection,
} from '@/lib/email/zoho-connections';

export const dynamic = 'force-dynamic';

import { parseEmailAddress } from '@/lib/email/address-parse';

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Best-effort lookup of who the sender is across the portal. */
async function gatherKnowledge(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
): Promise<string[]> {
  const notes: string[] = [];

  try {
    const { data: contacts } = await admin
      .from('customer_contacts')
      .select('name, role, customer_id')
      .ilike('email', email)
      .limit(3);
    for (const c of contacts ?? []) {
      let company = '';
      let agent = '';
      let industry = '';
      try {
        const { data: cust } = await admin
          .from('customers')
          .select('company, agent, industry, notes')
          .eq('id', c.customer_id)
          .maybeSingle();
        company = String(cust?.company ?? '');
        agent = String(cust?.agent ?? '');
        industry = String(cust?.industry ?? '');
        if (cust?.notes) notes.push(`Account note for ${company}: ${String(cust.notes).slice(0, 200)}`);
      } catch {
        /* ignore */
      }
      notes.push(
        `${c.name}${c.role ? ` (${c.role})` : ''} is a customer contact${company ? ` at ${company}` : ''}${industry ? `, ${industry}` : ''}${agent && agent !== 'Unassigned' ? `, managed by ${agent}` : ''}.`,
      );
    }
  } catch {
    /* ignore */
  }

  try {
    const { data: supContacts } = await admin
      .from('solution_provider_contacts')
      .select('name, role, provider_id')
      .ilike('email', email)
      .limit(3);
    for (const s of supContacts ?? []) {
      let provider = '';
      try {
        const { data: p } = await admin
          .from('solution_providers')
          .select('name, provider_category')
          .eq('id', s.provider_id)
          .maybeSingle();
        provider = String(p?.name ?? '');
      } catch {
        /* ignore */
      }
      notes.push(
        `${s.name}${s.role ? ` (${s.role})` : ''} is a contact at supplier${provider ? ` ${provider}` : ''}.`,
      );
    }
  } catch {
    /* ignore */
  }

  return notes;
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    messageId?: string;
    folderId?: string;
    from: string;
    to?: string;
    subject: string;
    hint?: string;
    mode?: 'reply' | 'new';
  };
  const isNew = body.mode === 'new';
  const recipientRaw = (isNew ? body.to ?? body.from : body.from)?.trim();
  if (!recipientRaw) return NextResponse.json({ error: 'Recipient required' }, { status: 400 });

  const senderEmail = parseEmailAddress(recipientRaw.split(/[,;]/)[0] ?? recipientRaw);
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.email ? user.email.split('@')[0] : 'there');

  const connection =
    (await getActiveConnectionForUser(user.id)) ?? (await getActiveSharedConnection());
  const admin = createSupabaseAdminClient();

  // Gather Zoho conversation history and portal knowledge concurrently to keep
  // the request well under serverless timeouts (a slow chain here was surfacing
  // as an empty/timed-out response in the compose modal).
  const historyTask = (async (): Promise<{ history: string; latestBody: string }> => {
    if (!connection) return { history: '', latestBody: '' };
    try {
      const [msgs, content] = await Promise.all([
        searchConversation({
          accessToken: connection.accessToken,
          accountId: connection.accountId,
          email: senderEmail,
          limit: 8,
        }),
        body.messageId && body.folderId && !isNew
          ? getMessageContent({
              accessToken: connection.accessToken,
              accountId: connection.accountId,
              folderId: body.folderId,
              messageId: body.messageId,
            }).catch(() => '')
          : Promise.resolve(''),
      ]);
      const history = msgs
        .slice(0, 6)
        .map(
          (m) =>
            `- ${new Date(m.receivedTime || m.sentTime).toLocaleDateString()} ${m.fromAddress.includes(senderEmail) ? senderEmail : 'me'}: ${m.subject} — ${m.summary}`,
        )
        .join('\n');
      return { history, latestBody: stripHtml(content).slice(0, 1500) };
    } catch {
      return { history: '', latestBody: '' };
    }
  })();

  const [{ history, latestBody }, knowledge, contextRes] = await Promise.all([
    historyTask,
    gatherKnowledge(admin, senderEmail),
    admin
      .from('assistant_context')
      .select('subject, info, scope')
      .or(`owner_id.eq.${user.id},scope.eq.team`)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  const memoryTxt = (contextRes.data ?? []).length
    ? (contextRes.data ?? []).map((c) => `- ${c.subject}: ${c.info}`).join('\n')
    : '(none)';

  const systemPrompt = isNew
    ? `You are ${displayName}, a technology & payments advisor at Candid (helps businesses analyze bills and source better suppliers). Write a concise, warm, professional outbound email. Use what you know about the recipient and prior conversation when relevant. Do not invent facts, prices, or commitments. Output ONLY the email body text (no subject line, no "Subject:", no markdown). End with a sign-off as ${displayName}, Candid.`
    : `You are ${displayName}, a technology & payments advisor at Candid (helps businesses analyze bills and source better suppliers). Write a concise, warm, professional email reply. Use what you know about the recipient and prior conversation. Do not invent facts, prices, or commitments. Output ONLY the email body text (no subject line, no "Subject:", no markdown). End with a sign-off as ${displayName}, Candid.`;

  const userPrompt = isNew
    ? `Write a new outbound email.

To: ${recipientRaw}
Subject: ${body.subject || '(not set yet — write a general message that fits a professional outreach)'}

## What I know about them (from the portal)
${knowledge.length ? knowledge.join('\n') : '(no portal match — treat as a new contact)'}

## Prior conversation
${history || '(no prior emails found)'}

## Things I remember
${memoryTxt}
${body.hint ? `\n## How I want to write this\n${body.hint}` : ''}

Write the email body now.`
    : `Write a reply to this email.

From: ${body.from}
Subject: ${body.subject}
${latestBody ? `\nTheir latest message:\n"""${latestBody}"""` : ''}

## What I know about them (from the portal)
${knowledge.length ? knowledge.join('\n') : '(no portal match — treat as a new contact)'}

## Prior conversation
${history || '(no prior emails found)'}

## Things I remember
${memoryTxt}
${body.hint ? `\n## How I want to respond\n${body.hint}` : ''}

Write the reply now.`;

  let draft = '';
  try {
    draft = await askHankServer([{ role: 'user', content: userPrompt }], {
      systemPrompt,
      maxTokens: 900,
      routeLabel: 'assistant-draft',
      userId: user.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Draft failed' },
      { status: 502 },
    );
  }

  const subject = isNew
    ? body.subject || ''
    : /^re:/i.test(body.subject)
      ? body.subject
      : `Re: ${body.subject}`;

  return NextResponse.json({
    draft: draft.trim(),
    to: senderEmail,
    subject,
    knowledge,
  });
}
