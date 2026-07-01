import type { BillParsePhoneLine, BillParsePortingSelection, BillParseResult } from '@/lib/bill-parse-types';

/** Normalize to digits for comparison / Set keys. */
export function normalizePhoneKey(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

/** Format a US phone number for display; returns original if not 10-digit US. */
export function formatPhoneDisplay(number: string): string {
  const key = normalizePhoneKey(number);
  if (key.length === 10) {
    return `(${key.slice(0, 3)}) ${key.slice(3, 6)}-${key.slice(6)}`;
  }
  return number.trim();
}

function mapPhoneLine(raw: Record<string, unknown>): BillParsePhoneLine | null {
  const number = String(raw.number ?? raw.phone ?? '').trim();
  if (!number) return null;
  return {
    number: formatPhoneDisplay(number),
    label: String(raw.label ?? raw.description ?? '').trim() || undefined,
    isPrimary: raw.isPrimary === true || raw.primary === true,
  };
}

/** Dedupe phone lines by normalized number; keep first primary marker. */
export function dedupePhoneLines(lines: BillParsePhoneLine[]): BillParsePhoneLine[] {
  const seen = new Map<string, BillParsePhoneLine>();
  for (const line of lines) {
    const key = normalizePhoneKey(line.number);
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, line);
      continue;
    }
    if (line.isPrimary && !existing.isPrimary) {
      seen.set(key, { ...existing, isPrimary: true, label: line.label ?? existing.label });
    }
  }
  const result = [...seen.values()];
  if (result.length > 0 && !result.some((l) => l.isPrimary)) {
    result[0] = { ...result[0], isPrimary: true };
  }
  return result;
}

export function getUcaasPhoneLines(parseResult?: BillParseResult | null): BillParsePhoneLine[] {
  if (!parseResult || parseResult.category !== 'ucaas') return [];
  return dedupePhoneLines(parseResult.ucaasPhoneLines ?? []);
}

export function formatPortingAdminNote(
  porting: BillParsePortingSelection | undefined,
  phoneLines: BillParsePhoneLine[],
): string | null {
  if (!porting || phoneLines.length === 0) return null;

  const selectedKeys = new Set(porting.selectedNumbers.map(normalizePhoneKey));
  const toPort = phoneLines.filter((l) => selectedKeys.has(normalizePhoneKey(l.number)));
  const skipped = phoneLines.filter((l) => !selectedKeys.has(normalizePhoneKey(l.number)));

  const lines = [
    `Port all numbers: ${porting.portAll ? 'Yes' : 'No'}`,
    toPort.length
      ? `Numbers to port (${toPort.length}):\n${toPort
          .map((l) => `  - ${l.number}${l.isPrimary ? ' (primary)' : ''}${l.label ? ` — ${l.label}` : ''}`)
          .join('\n')}`
      : 'Numbers to port: none selected',
  ];
  if (skipped.length) {
    lines.push(
      `Not porting (${skipped.length}):\n${skipped
        .map((l) => `  - ${l.number}${l.label ? ` — ${l.label}` : ''}`)
        .join('\n')}`,
    );
  }
  return lines.join('\n');
}

export function buildDefaultPortingSelection(phoneLines: BillParsePhoneLine[]): BillParsePortingSelection {
  return {
    portAll: true,
    selectedNumbers: phoneLines.map((l) => l.number),
  };
}
