/** Resolve a safe Content-Type for CRM / email uploads from filename + reported type. */

const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.doc': 'application/msword',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
};

/** MIME types that are often wrong when coming from Zoho / proxies. */
function isUntrustedMime(mime: string | null | undefined): boolean {
  if (!mime) return true;
  const m = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    !m ||
    m === 'text/html' ||
    m === 'application/octet-stream' ||
    m === 'binary/octet-stream' ||
    m === 'application/force-download'
  );
}

export function mimeFromFilename(filename: string): string | null {
  const base = filename.trim().toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot < 0) return null;
  return EXT_MIME[base.slice(dot)] ?? null;
}

/**
 * Prefer a known extension MIME when the reported type is missing or clearly wrong
 * (Zoho often returns text/html for PDF attachments).
 */
export function resolveUploadContentType(filename: string, reportedType?: string | null): string {
  const fromName = mimeFromFilename(filename);
  const reported = (reportedType ?? '').split(';')[0]?.trim() || '';
  if (fromName && isUntrustedMime(reported)) return fromName;
  if (reported) return reported;
  return fromName || 'application/octet-stream';
}
