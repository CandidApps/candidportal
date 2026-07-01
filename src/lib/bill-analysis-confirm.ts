import type {
  BillParseCustomerConfirmation,
  BillParsePhoneLine,
  BillParsePortingSelection,
} from '@/lib/bill-parse-types';
import { formatPortingAdminNote } from '@/lib/bill-parse-phones';

export type BillAnalysisConfirmPayload = {
  notes?: string;
  porting?: BillParsePortingSelection;
};

export function buildCustomerConfirmation(
  payload: BillAnalysisConfirmPayload,
  now: string,
): BillParseCustomerConfirmation {
  return {
    notes: payload.notes?.trim() || undefined,
    confirmedAt: now,
    porting: payload.porting,
  };
}

export function buildConfirmAdminNotes(
  payload: BillAnalysisConfirmPayload,
  phoneLines: BillParsePhoneLine[],
  now: string,
): string {
  const blocks: string[] = [];
  const portingNote = formatPortingAdminNote(payload.porting, phoneLines);
  if (portingNote) {
    blocks.push(`Customer porting (${now}):\n${portingNote}`);
  }
  if (payload.notes?.trim()) {
    blocks.push(`Customer notes (${now}):\n${payload.notes.trim()}`);
  }
  if (!blocks.length) {
    blocks.push(`Customer confirmed bill details (${now}).`);
  }
  return blocks.join('\n\n');
}
