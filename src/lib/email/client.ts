export type ZohoConnectionStatus = {
  configured: boolean;
  connection: {
    email: string | null;
    displayName: string | null;
    isShared: boolean;
    connectedAt: string;
  } | null;
  sharedConfigured: boolean;
};

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

/** Parses JSON safely so an empty/non-JSON body (timeout, 204, HTML error)
 *  surfaces a readable error instead of "Unexpected end of JSON input". */
async function safeJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text().catch(() => '');
  if (!text.trim()) {
    if (!res.ok) throw new Error(`Request failed (${res.status || 'network error'}).`);
    return {} as T & { error?: string };
  }
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(`Unexpected response from server (${res.status}).`);
  }
}

export async function fetchZohoConnection(): Promise<ZohoConnectionStatus> {
  const res = await fetch('/api/zoho/connection');
  if (!res.ok) throw new Error('Failed to load mailbox status');
  return (await res.json()) as ZohoConnectionStatus;
}

export async function disconnectZoho(): Promise<void> {
  const res = await fetch('/api/zoho/connection', { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to disconnect mailbox');
}

export async function sendCustomerEmail(input: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string;
  bcc?: string;
}): Promise<{ sentFrom: string }> {
  const res = await fetch('/api/admin/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { sentFrom?: string; error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to send email');
  return { sentFrom: json.sentFrom ?? '' };
}

export async function fetchCustomerConversation(email: string): Promise<{
  connected: boolean;
  mailbox?: string;
  messages: ConversationMessage[];
}> {
  const params = new URLSearchParams({ email });
  const res = await fetch(`/api/admin/email/conversation?${params}`);
  const json = await safeJson<{
    connected?: boolean;
    mailbox?: string;
    messages?: ConversationMessage[];
  }>(res);
  if (!res.ok) throw new Error(json.error ?? 'Failed to load conversation');
  return {
    connected: Boolean(json.connected),
    mailbox: json.mailbox,
    messages: json.messages ?? [],
  };
}

export async function fetchMessageContent(
  email: string,
  messageId: string,
  folderId: string,
): Promise<string> {
  const params = new URLSearchParams({ email, messageId, folderId });
  const res = await fetch(`/api/admin/email/conversation?${params}`);
  const json = await safeJson<{ content?: string }>(res);
  if (!res.ok) throw new Error(json.error ?? 'Failed to load message');
  return json.content ?? '';
}
