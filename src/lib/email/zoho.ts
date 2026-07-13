import 'server-only';

import {
  normalizeAddressField,
  parseEmailAddress,
} from '@/lib/email/address-parse';
import {
  cleanDialpadRecapContent,
  stripDialpadRecapLinkText,
} from '@/lib/email/dialpad-recap-link';

/**
 * Thin Zoho Mail REST client. Handles the OAuth dance, access-token refresh,
 * account lookup, sending, and searching a customer conversation.
 *
 * Docs: https://www.zoho.com/mail/help/api/
 */

export const ZOHO_SCOPES =
  'ZohoMail.accounts.READ,ZohoMail.messages.ALL,ZohoCalendar.calendar.READ,ZohoCalendar.event.ALL,ZohoCalendar.freebusy.READ,ZohoExpense.fullaccess.all';

/** Scope substrings required for MyAssistant calendar features. */
export const ZOHO_CALENDAR_SCOPE = 'ZohoCalendar';

/** Scope substring required for Zoho Expense sync. */
export const ZOHO_EXPENSE_SCOPE = 'ZohoExpense';

/** Scope substring required for the free/busy availability lookups. */
export const ZOHO_FREEBUSY_SCOPE = 'ZohoCalendar.freebusy';

/** True when a stored connection's granted scope string includes calendar access. */
export function scopeHasCalendar(scope: string | null | undefined): boolean {
  return Boolean(scope && scope.includes(ZOHO_CALENDAR_SCOPE));
}

/** True when a stored connection's granted scope string includes Expense access. */
export function scopeHasExpense(scope: string | null | undefined): boolean {
  return Boolean(scope && scope.includes(ZOHO_EXPENSE_SCOPE));
}

/** True when a stored connection's granted scope string includes free/busy access. */
export function scopeHasFreeBusy(scope: string | null | undefined): boolean {
  return Boolean(scope && scope.includes(ZOHO_FREEBUSY_SCOPE));
}

export type ZohoConfig = {
  accountsDomain: string;
  apiDomain: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function isZohoConfigured(): boolean {
  return Boolean(
    process.env.ZOHO_CLIENT_ID &&
      process.env.ZOHO_CLIENT_SECRET &&
      process.env.ZOHO_REDIRECT_URI,
  );
}

export function zohoConfig(): ZohoConfig {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Zoho is not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REDIRECT_URI.',
    );
  }
  return {
    accountsDomain: process.env.ZOHO_ACCOUNTS_DOMAIN ?? 'https://accounts.zoho.com',
    apiDomain: process.env.ZOHO_MAIL_API_DOMAIN ?? 'https://mail.zoho.com',
    clientId,
    clientSecret,
    redirectUri,
  };
}

export function buildAuthorizeUrl(state: string): string {
  const cfg = zohoConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    scope: ZOHO_SCOPES,
    redirect_uri: cfg.redirectUri,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${cfg.accountsDomain}/oauth/v2/auth?${params.toString()}`;
}

type ZohoTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};

export type ZohoTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
};

export async function exchangeCodeForTokens(code: string): Promise<ZohoTokens> {
  const cfg = zohoConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });
  const res = await fetch(`${cfg.accountsDomain}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as ZohoTokenResponse;
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`Zoho token exchange failed: ${json.error ?? res.statusText}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 3600,
  };
}

export async function refreshAccessTokenDetailed(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const cfg = zohoConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${cfg.accountsDomain}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as ZohoTokenResponse;
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`Zoho token refresh failed: ${json.error ?? res.statusText}`);
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  return (await refreshAccessTokenDetailed(refreshToken)).accessToken;
}

export type ZohoAccount = {
  accountId: string;
  email: string;
  displayName: string;
};

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    Accept: 'application/json',
  };
}

/** Returns the primary mailbox account for the authenticated token. */
export async function getPrimaryAccount(accessToken: string): Promise<ZohoAccount> {
  const cfg = zohoConfig();
  const res = await fetch(`${cfg.apiDomain}/api/accounts`, {
    headers: authHeaders(accessToken),
  });
  const json = (await res.json()) as { data?: Record<string, unknown>[]; status?: unknown };
  if (!res.ok || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error('Could not load Zoho account details.');
  }
  const first = json.data[0]!;
  const accountId = String(
    first.accountId ?? first.account_id ?? first.zid ?? '',
  );
  const sendDetails = Array.isArray(first.sendMailDetails)
    ? (first.sendMailDetails[0] as Record<string, unknown> | undefined)
    : undefined;
  const email = String(
    first.primaryEmailAddress ??
      first.mailboxAddress ??
      sendDetails?.fromAddress ??
      first.incomingUserName ??
      '',
  );
  const displayName = String(
    first.displayName ?? first.accountDisplayName ?? sendDetails?.displayName ?? email,
  );
  if (!accountId) {
    throw new Error('Zoho account response missing accountId.');
  }
  return { accountId, email, displayName };
}

export type SendMailInput = {
  accessToken: string;
  accountId: string;
  fromAddress: string;
  toAddress: string;
  ccAddress?: string;
  bccAddress?: string;
  subject: string;
  content: string;
  /** 'html' (default) or 'plaintext' */
  mailFormat?: 'html' | 'plaintext';
};

export async function sendMail(input: SendMailInput): Promise<void> {
  const cfg = zohoConfig();
  const res = await fetch(`${cfg.apiDomain}/api/accounts/${input.accountId}/messages`, {
    method: 'POST',
    headers: {
      ...authHeaders(input.accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      ccAddress: input.ccAddress,
      bccAddress: input.bccAddress,
      subject: input.subject,
      content: input.content,
      mailFormat: input.mailFormat ?? 'html',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho send failed (${res.status}): ${text}`);
  }
}

export type ConversationMessage = {
  messageId: string;
  folderId: string;
  fromAddress: string;
  sender: string;
  subject: string;
  summary: string;
  sentTime: number;
  receivedTime: number;
  status: string;
  hasAttachment: boolean;
};

/**
 * Returns messages to/from a given email address (newest first), using Zoho's
 * searchKey syntax: `sender:<email>::or:to:<email>`.
 */
export async function searchConversation(input: {
  accessToken: string;
  accountId: string;
  email: string;
  limit?: number;
}): Promise<ConversationMessage[]> {
  const cfg = zohoConfig();
  const target = input.email.trim().toLowerCase();
  const searchKey = `sender:${target}::or:to:${target}`;
  const params = new URLSearchParams({
    searchKey,
    limit: String(Math.min(Math.max(input.limit ?? 50, 1), 200)),
    includeto: 'true',
  });
  const res = await fetch(
    `${cfg.apiDomain}/api/accounts/${input.accountId}/messages/search?${params.toString()}`,
    { headers: authHeaders(input.accessToken) },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho search failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data?: Record<string, unknown>[] };
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows
    .map((r) => ({
      messageId: String(r.messageId ?? ''),
      folderId: String(r.folderId ?? ''),
      fromAddress: String(r.fromAddress ?? ''),
      sender: String(r.sender ?? ''),
      subject: String(r.subject ?? '(no subject)'),
      summary: String(r.summary ?? ''),
      sentTime: Number(r.sentDateInGMT ?? r.receivedtime ?? 0),
      receivedTime: Number(r.receivedtime ?? r.sentDateInGMT ?? 0),
      status: String(r.status ?? ''),
      hasAttachment: Boolean(Number(r.hasAttachment ?? 0)),
    }))
    .sort((a, b) => b.receivedTime - a.receivedTime);
}

export type InboxMessage = {
  messageId: string;
  folderId: string;
  fromAddress: string;
  sender: string;
  /** Raw To recipients string (comma/space separated), used for reply-all. */
  toAddress: string;
  /** Raw Cc recipients string (comma/space separated), used for reply-all. */
  ccAddress: string;
  subject: string;
  summary: string;
  receivedTime: number;
  isUnread: boolean;
  hasAttachment: boolean;
};

function mapInboxRow(r: Record<string, unknown>): InboxMessage {
  // Zoho status flags: status2 "0" = read, "1" = unread (varies); fall back to status.
  const status = String(r.status ?? r.status2 ?? '');
  const isUnread = status === '1' || status.toLowerCase() === 'unread';
  const rawFrom = normalizeAddressField(String(r.fromAddress ?? ''));
  const rawSender = normalizeAddressField(String(r.sender ?? r.fromAddress ?? ''));
  return {
    messageId: String(r.messageId ?? ''),
    folderId: String(r.folderId ?? ''),
    fromAddress: parseEmailAddress(rawFrom) || rawFrom,
    sender: rawSender,
    toAddress: normalizeAddressField(String(r.toAddress ?? r.to ?? '')),
    ccAddress: normalizeAddressField(String(r.ccAddress ?? r.cc ?? '')),
    subject: String(r.subject ?? '(no subject)'),
    summary: String(r.summary ?? ''),
    receivedTime: Number(r.receivedTime ?? r.receivedtime ?? r.sentDateInGMT ?? 0),
    isUnread,
    hasAttachment: Boolean(Number(r.hasAttachment ?? 0)),
  };
}

/**
 * Lists recent inbox messages for the account (newest first). Used to surface
 * email that may need a response/action on the MyAssistant page.
 */
export async function listInboxMessages(input: {
  accessToken: string;
  accountId: string;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<InboxMessage[]> {
  const cfg = zohoConfig();
  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(input.limit ?? 25, 1), 200)),
    includeto: 'true',
  });
  if (input.unreadOnly) params.set('status', 'unread');
  const res = await fetch(
    `${cfg.apiDomain}/api/accounts/${input.accountId}/messages/view?${params.toString()}`,
    { headers: authHeaders(input.accessToken) },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho inbox fetch failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data?: Record<string, unknown>[] };
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows.map(mapInboxRow).sort((a, b) => b.receivedTime - a.receivedTime);
}

/**
 * Finds Dialpad call-recap emails (Dialpad sends a recap after calls). We match
 * on sender domain and common recap subjects.
 */
export async function listDialpadRecaps(input: {
  accessToken: string;
  accountId: string;
  limit?: number;
}): Promise<InboxMessage[]> {
  const cfg = zohoConfig();
  const params = new URLSearchParams({
    searchKey: 'sender:dialpad.com',
    limit: String(Math.min(Math.max(input.limit ?? 20, 1), 100)),
    includeto: 'true',
  });
  const res = await fetch(
    `${cfg.apiDomain}/api/accounts/${input.accountId}/messages/search?${params.toString()}`,
    { headers: authHeaders(input.accessToken) },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho recap search failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data?: Record<string, unknown>[] };
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows
    .map(mapInboxRow)
    .filter((m) => isDialpadRecapSubject(m.subject))
    .sort((a, b) => b.receivedTime - a.receivedTime);
}

/**
 * True when a Dialpad email subject looks like an AI call/meeting recap rather
 * than a transactional or admin notification. The mailbox search already scopes
 * to sender:dialpad.com, so we must NOT treat every Dialpad email as a recap —
 * notifications like "An API key … was generated for company …" were being
 * parsed as recap bodies and shown in place of the real summary.
 */
export function isDialpadRecapSubject(subject: string): boolean {
  const s = (subject ?? '').toLowerCase();
  // Hard exclusions: account/security/billing/system notifications.
  if (
    /\b(api key|was generated|access token|password|billing|invoice|receipt|payment|subscription|security|sign[- ]?in|log[- ]?in|verify|verification|confirm your|porting|provision|number (assigned|purchased)|account (created|updated|settings)|welcome|new device|two[- ]?factor|2fa)\b/i.test(
      s,
    )
  ) {
    return false;
  }
  // Inclusions: phrasing Dialpad uses for AI recap/summary emails.
  return /\b(recap|summary|summari[sz]ed|transcript|call notes|meeting notes|notes from your|ai (call|meeting)?\s*recap|call with|meeting with)\b/i.test(
    s,
  );
}

export type DialpadRecap = {
  emailId: string;
  folderId: string;
  title: string;
  fromAddress: string;
  receivedTime: number;
  summary: string;
  actionItems: string[];
  /** Dialpad call-review URL from the recap email, when present. */
  recapUrl: string | null;
  /** Phone number found in the recap, used to help match a meeting. */
  phone: string | null;
};

/** Strips HTML to readable plain text. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h\d|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Heuristically parses a Dialpad call-recap email body into a short summary
 * and a list of action items. Dialpad recaps include a "Summary" / "Purpose"
 * section and an "Action items" / "Next steps" bullet list.
 */
export function parseDialpadRecapText(text: string): { summary: string; actionItems: string[] } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const actionItems: string[] = [];
  const summaryParts: string[] = [];
  let mode: 'none' | 'summary' | 'actions' = 'none';

  const headerRe = {
    summary: /^(summary|purpose|overview|recap|call summary|meeting summary)\b[:\-]?/i,
    actions: /^(action items?|next steps?|follow[- ]?ups?|to[- ]?dos?|tasks?)\b[:\-]?/i,
    other: /^(participants?|attendees?|date|duration|sentiment|transcript|key topics?|topics?)\b[:\-]?/i,
  };
  const RECAP_LINK_LABEL =
    /^(?:view\s+ai\s+recap|view\s+recap|open\s+(?:full\s+)?recap)\s*[:\-]?\s*$/i;

  for (const line of lines) {
    if (RECAP_LINK_LABEL.test(line) || /^view\s+ai\s+recap\b/i.test(line)) continue;
    if (headerRe.actions.test(line)) {
      mode = 'actions';
      const after = line.replace(headerRe.actions, '').trim();
      if (after) actionItems.push(after.replace(/^[-•*\d.)\s]+/, '').trim());
      continue;
    }
    if (headerRe.summary.test(line)) {
      mode = 'summary';
      const after = line.replace(headerRe.summary, '').trim();
      if (after) summaryParts.push(after);
      continue;
    }
    if (headerRe.other.test(line)) {
      mode = 'none';
      continue;
    }
    const bullet = line.match(/^[-•*]\s+(.*)$/) || line.match(/^\d+[.)]\s+(.*)$/);
    if (mode === 'actions') {
      if (bullet) actionItems.push(bullet[1].trim());
      else if (line.length > 3 && !/^https?:\/\//.test(line)) actionItems.push(line);
    } else if (mode === 'summary') {
      if (summaryParts.join(' ').length < 600) summaryParts.push(line);
    } else if (bullet && actionItems.length === 0 && /\b(will|need|send|follow|schedule|call|email|review)\b/i.test(bullet[1])) {
      // Loose capture: bullet that reads like an action even without a header.
      actionItems.push(bullet[1].trim());
    }
  }

  let summary = summaryParts.join(' ').replace(/\s+/g, ' ').trim();
  if (!summary) {
    // Fall back to the first substantial sentence(s), skipping lines that read
    // like a transactional/admin notice (so a stray non-recap email never shows
    // up as "An API key … was generated …").
    const body = lines
      .filter(
        (l) =>
          l.length > 30 &&
          !/^https?:\/\//.test(l) &&
          !/\b(api key|was generated|access token|do not reply|unsubscribe|password)\b/i.test(l),
      )
      .join(' ');
    summary = body.slice(0, 400).trim();
  }
  return {
    summary: stripDialpadRecapLinkText(summary.slice(0, 700)),
    actionItems: actionItems
      .map((a) => a.replace(/^[-•*\d.)\s]+/, '').trim())
      .filter((a) => a.length > 2 && a.length < 240)
      .slice(0, 8),
  };
}

/**
 * Loads recent Dialpad recaps with their content fetched and parsed into a
 * summary + action items. Used to attach call outcomes to calendar meetings.
 */
export async function listDialpadRecapsDetailed(input: {
  accessToken: string;
  accountId: string;
  limit?: number;
}): Promise<DialpadRecap[]> {
  const base = await listDialpadRecaps({
    accessToken: input.accessToken,
    accountId: input.accountId,
    limit: input.limit ?? 10,
  });

  const out: DialpadRecap[] = [];
  for (const m of base) {
    let parsed = { summary: m.summary, actionItems: [] as string[] };
    let recapUrl: string | null = null;
    try {
      const html = await getMessageContent({
        accessToken: input.accessToken,
        accountId: input.accountId,
        folderId: m.folderId,
        messageId: m.messageId,
      });
      const cleaned = cleanDialpadRecapContent({ html });
      recapUrl = cleaned.recapUrl;
      const text = htmlToText(html);
      parsed = parseDialpadRecapText(text);
      if (!parsed.summary) parsed.summary = cleaned.text || m.summary;
      parsed.summary = stripDialpadRecapLinkText(parsed.summary, recapUrl);
    } catch {
      /* fall back to the summary snippet */
    }
    const phoneMatch = `${m.subject} ${m.summary}`.match(
      /(\+?1?[\s-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/,
    );
    out.push({
      emailId: m.messageId,
      folderId: m.folderId,
      title: m.subject,
      fromAddress: m.fromAddress,
      receivedTime: m.receivedTime,
      summary: parsed.summary,
      actionItems: parsed.actionItems,
      recapUrl,
      phone: phoneMatch ? phoneMatch[1].trim() : null,
    });
  }
  return out;
}

/** Fetches the full content (HTML) of a single message. */
export async function getMessageContent(input: {
  accessToken: string;
  accountId: string;
  folderId: string;
  messageId: string;
}): Promise<string> {
  const cfg = zohoConfig();
  const res = await fetch(
    `${cfg.apiDomain}/api/accounts/${input.accountId}/folders/${input.folderId}/messages/${input.messageId}/content`,
    { headers: authHeaders(input.accessToken) },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho content fetch failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data?: { content?: string } };
  return json.data?.content ?? '';
}

export type ZohoAttachmentInfo = {
  attachmentId: string;
  attachmentName: string;
  attachmentSize: number;
};

/** Lists attachments on a message. */
export async function getMessageAttachments(input: {
  accessToken: string;
  accountId: string;
  folderId: string;
  messageId: string;
  /** Include inline parts (signatures/images AND calendar invites). Default false. */
  includeInline?: boolean;
}): Promise<ZohoAttachmentInfo[]> {
  const cfg = zohoConfig();
  const params = new URLSearchParams({
    includeInline: input.includeInline ? 'true' : 'false',
  });
  const res = await fetch(
    `${cfg.apiDomain}/api/accounts/${input.accountId}/folders/${input.folderId}/messages/${input.messageId}/attachmentinfo?${params}`,
    { headers: authHeaders(input.accessToken) },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho attachment info failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    data?: { attachments?: Array<Record<string, unknown>> };
  };
  const rows = Array.isArray(json.data?.attachments) ? json.data!.attachments! : [];
  return rows
    .map((r) => ({
      attachmentId: String(r.attachmentId ?? ''),
      attachmentName: String(r.attachmentName ?? 'attachment'),
      attachmentSize: Number(r.attachmentSize ?? 0),
    }))
    .filter((a) => a.attachmentId);
}

/** Downloads a single attachment as raw bytes. */
export async function downloadMessageAttachment(input: {
  accessToken: string;
  accountId: string;
  folderId: string;
  messageId: string;
  attachmentId: string;
}): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const cfg = zohoConfig();
  const res = await fetch(
    `${cfg.apiDomain}/api/accounts/${input.accountId}/folders/${input.folderId}/messages/${input.messageId}/attachments/${input.attachmentId}`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${input.accessToken}`,
        Accept: 'application/octet-stream',
      },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho attachment download failed (${res.status}): ${text}`);
  }
  const bytes = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  return { bytes, contentType };
}
