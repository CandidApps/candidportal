/**
 * Vercel rejects function request bodies over 4.5MB with a plain-text 413 before our route runs.
 * Base64 inflates files by ~4/3, so inline parsing is capped well below that.
 */
export const MAX_INLINE_PARSE_BASE64_CHARS = 4_000_000;

/** Anthropic PDF input limits. */
export const MAX_PARSE_PDF_PAGES = 100;
export const MAX_PARSE_FILE_BYTES = 32 * 1024 * 1024;

export function formatFileSizeMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function inlineParseLimitLabel(): string {
  return formatFileSizeMb((MAX_INLINE_PARSE_BASE64_CHARS * 3) / 4);
}

export function tooLargeForInlineParseMessage(fileBytes: number): string {
  return `This file is ${formatFileSizeMb(fileBytes)} — too large to read on upload (limit ${inlineParseLimitLabel()}). Save it to the account and use Reparse on the saved document, or enter details manually.`;
}

/**
 * Turns a failed parse response into an actionable message. Handles the plain-text 413 / 504 pages
 * Vercel returns, which never reach our JSON error handler.
 */
export async function parseRequestErrorMessage(res: Response, fallback: string): Promise<string> {
  let serverMessage: string | undefined;
  try {
    const text = await res.text();
    try {
      serverMessage = (JSON.parse(text) as { error?: string }).error;
    } catch {
      /* non-JSON platform error page */
    }
  } catch {
    /* body unreadable */
  }
  if (serverMessage) return serverMessage;
  if (res.status === 413) {
    return `Document is too large to send for parsing (limit ${inlineParseLimitLabel()}). Enter details manually, or use Reparse on a saved document.`;
  }
  if (res.status === 504 || res.status === 408) {
    return 'Document parsing timed out. Try again, or enter details manually.';
  }
  if (res.status === 503) return 'Document parsing is not configured on the server.';
  return fallback;
}
