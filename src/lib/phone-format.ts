/**
 * US phone formatting for inputs and display: (815) 207-8000.
 * Values that aren't a US number (international "+44…", more than 11 digits,
 * or letters like "ext") are left as typed.
 */

function usDigits(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\+(?!1)/.test(trimmed)) return null;
  if (/[a-z]/i.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length > 10) return null;
  return digits;
}

/** Live input mask — call from onChange with the raw input value. */
export function formatUsPhoneInput(raw: string): string {
  const digits = usDigits(raw);
  if (digits == null) return raw;
  if (!digits) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Display / save normalization — only reformats complete 10-digit US numbers. */
export function formatUsPhone(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const digits = usDigits(value);
  if (digits == null || digits.length !== 10) return value;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
