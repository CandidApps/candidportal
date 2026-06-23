import type { SheetRow } from '@/lib/spreadsheet-io';

export type ChatAttachment = {
  id: string;
  name: string;
  size: number;
  text: string;
  status: 'ready' | 'error';
  error?: string;
};

export const CHAT_ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls,.txt';
export const CHAT_ATTACHMENT_MAX_FILES = 5;
const MAX_TEXT_PER_FILE = 14_000;
const MAX_SPREADSHEET_ROWS = 250;

function guessMediaType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function spreadsheetRowsToText(rows: SheetRow[]): string {
  if (!rows.length) return '(Empty spreadsheet)';
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join('\t'),
    ...rows.slice(0, MAX_SPREADSHEET_ROWS).map((row) =>
      headers.map((h) => String(row[h] ?? '')).join('\t'),
    ),
  ];
  if (rows.length > MAX_SPREADSHEET_ROWS) {
    lines.push(`… (${rows.length - MAX_SPREADSHEET_ROWS} more rows not shown)`);
  }
  return lines.join('\n');
}

function truncateText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_TEXT_PER_FILE) return trimmed;
  return `${trimmed.slice(0, MAX_TEXT_PER_FILE)}\n…[truncated]`;
}

export async function extractChatAttachmentText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'txt' || file.type.startsWith('text/')) {
    return truncateText(await file.text());
  }

  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
    const { parseSpreadsheetFile } = await import('@/lib/spreadsheet-io');
    return truncateText(spreadsheetRowsToText(await parseSpreadsheetFile(file)));
  }

  if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
    const res = await fetch('/api/chat-attachment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: await fileToBase64(file),
        mediaType: file.type || guessMediaType(file.name),
        filename: file.name,
      }),
    });
    const body = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
    if (!res.ok) throw new Error(body?.error ?? 'Could not read this file');
    return truncateText(body?.text ?? '');
  }

  throw new Error('Unsupported file type. Use PDF, image, CSV, Excel, or TXT.');
}

export function formatUserMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[],
): string {
  const ready = attachments.filter((a) => a.status === 'ready' && a.text.trim());
  const trimmed = message.trim();

  if (!ready.length) return trimmed;

  const docBlocks = ready
    .map((a) => `### ${a.name}\n${a.text}`)
    .join('\n\n');

  const userPart = trimmed || '(Please use the attached document(s) to answer.)';
  return `${userPart}\n\n---\n**Attached documents for reference:**\n\n${docBlocks}`;
}

export function formatUserMessageDisplay(
  message: string,
  attachmentNames: string[],
): string {
  const trimmed = message.trim();
  if (!attachmentNames.length) return trimmed;

  const chips = attachmentNames
    .map(
      (name) =>
        `<span style="display:inline-block;font-size:11px;background:var(--gray-light);border:1px solid var(--gray-border);border-radius:4px;padding:2px 8px;margin:0 6px 4px 0;">📎 ${escapeHtml(name)}</span>`,
    )
    .join('');

  if (!trimmed) return chips;
  return `${chips}<br/>${escapeHtml(trimmed)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function newAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
