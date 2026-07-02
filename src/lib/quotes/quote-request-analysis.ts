import {
  detectServiceTypeFromText,
  serviceProfiles,
  type ServiceProfileKey,
} from '@/lib/candid-data';
import { quoteServiceById } from '@/lib/quote-flow-config';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import {
  formatQuoteRequestAnswers,
  resolveQuoteServiceLabel,
  sanitizeQuoteRequestNote,
} from '@/lib/services/quote-requests';

export interface AISuggestion {
  routingCheck: {
    status: 'confirmed' | 'mismatch' | 'suspicious';
    detectedService: string;
    requestedService: string;
    note: string;
  };
  recommendedAction: {
    action: 'submit_to_supplier' | 'request_info' | 'close_spam' | 'escalate' | 'generate_quote';
    reasoning: string;
  };
  draftReply?: string;
}

const PROFILE_TO_QUOTE_SERVICE: Partial<Record<ServiceProfileKey, string>> = {
  merchant: 'merchant',
  internet: 'internet',
  ucaas: 'ucaas',
  microsoft: 'cloud',
  security: 'security',
  cloud: 'cloud',
};

function profileLabel(key: ServiceProfileKey): string {
  if (key === 'default') return 'Unknown';
  return serviceProfiles[key]?.name.replace(/ Statement| Invoice| Subscription| Services Invoice/, '') ?? key;
}

function quoteServiceLabelFromId(id: string | null | undefined): string {
  if (!id) return 'Not specified';
  return quoteServiceById(id)?.label ?? id;
}

function isValidEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone?.trim()) return true;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

function isKeyboardMash(text: string | null | undefined): boolean {
  const t = text?.trim();
  if (!t || t.length < 5) return false;
  if (/(.)\1{4,}/.test(t)) return true;
  if (/^[bcdfghjklmnpqrstvwxyz]{6,}$/i.test(t)) return true;
  if (!/[aeiou]/i.test(t) && /^[a-z0-9]+$/i.test(t) && t.length >= 6) return true;
  if (/^(test|asdf|qwerty|xxx+|foo+|bar+|lorem)/i.test(t)) return true;
  return false;
}

function isPlaceholderText(text: string | null | undefined): boolean {
  const t = text?.trim().toLowerCase();
  if (!t) return false;
  return ['test', 'testing', 'asdf', 'n/a', 'na', 'none', 'xxx', 'tbd', 'placeholder'].includes(t);
}

function buildDetectionText(row: QuoteRequestRow): string {
  const answers = formatQuoteRequestAnswers(row)
    .map((a) => `${a.label} ${a.value}`)
    .join(' ');
  const note = sanitizeQuoteRequestNote(row.note, row);
  const vendors = row.vendor_names?.join(' ') ?? '';
  const services = row.services?.join(' ') ?? '';
  return [answers, note, vendors, services, row.company, row.location?.city].filter(Boolean).join(' ');
}

function detectQuoteServiceIdFromText(text: string): string | null {
  const profile = detectServiceTypeFromText(text);
  return PROFILE_TO_QUOTE_SERVICE[profile] ?? null;
}

function missingRequiredFields(row: QuoteRequestRow): string[] {
  const type = row.service_type_id ? quoteServiceById(row.service_type_id) : undefined;
  if (!type) return ['Service type'];
  const missing: string[] = [];
  for (const q of type.questions) {
    if (!q.required) continue;
    const raw = row.service_answers?.[q.id];
    if (raw === undefined || raw === '' || raw === false) {
      missing.push(q.label);
    }
  }
  if (!row.company?.trim()) missing.push('Company name');
  if (!row.contact_email?.trim()) missing.push('Contact email');
  return missing;
}

function hasInstantPricingData(row: QuoteRequestRow): boolean {
  if (row.service_type_id !== 'ucaas') return false;
  const seats = row.service_answers?.userCount;
  if (seats === undefined || seats === '' || Number(seats) <= 0) return false;
  return Boolean(row.company?.trim() && isValidEmail(row.contact_email));
}

function buildDraftReply(row: QuoteRequestRow, missing: string[]): string {
  const name = row.contact_name?.trim() || 'there';
  const lines = missing.map((f) => `• ${f}`);
  return `Hi ${name},

Thanks for your quote request — we're almost ready to put pricing together. Could you reply with:

${lines.join('\n')}

Once we have that, we'll turn around a quote quickly.

Best,
Candid Team`;
}

export function analyzeQuoteRequest(row: QuoteRequestRow): AISuggestion {
  const requestedId = row.service_type_id;
  const requestedService = quoteServiceLabelFromId(requestedId);
  const detectionText = buildDetectionText(row);
  const detectedProfile = detectServiceTypeFromText(detectionText);
  const detectedId = detectQuoteServiceIdFromText(detectionText);
  const detectedService = detectedId
    ? quoteServiceLabelFromId(detectedId)
    : profileLabel(detectedProfile);

  const suspiciousReasons: string[] = [];
  if (isKeyboardMash(row.company) || isPlaceholderText(row.company)) {
    suspiciousReasons.push('company name looks like test data');
  }
  if (isKeyboardMash(row.contact_name) || isPlaceholderText(row.contact_name)) {
    suspiciousReasons.push('contact name looks like test data');
  }
  if (row.contact_email && !isValidEmail(row.contact_email)) {
    suspiciousReasons.push('email format is invalid');
  }
  if (!isValidPhone(row.contact_phone)) {
    suspiciousReasons.push('phone number format is invalid');
  }
  if (isKeyboardMash(row.location?.city) || isKeyboardMash(row.location?.street)) {
    suspiciousReasons.push('location looks like keyboard mashing');
  }
  const freeNote = sanitizeQuoteRequestNote(row.note, row);
  if (isKeyboardMash(freeNote)) {
    suspiciousReasons.push('notes look like placeholder text');
  }

  const missing = missingRequiredFields(row);
  const routingMismatch =
    Boolean(requestedId && detectedId && requestedId !== detectedId && detectedProfile !== 'default');

  let routingStatus: AISuggestion['routingCheck']['status'] = 'confirmed';
  let routingNote = 'Requested service aligns with intake answers and notes.';

  if (suspiciousReasons.length >= 2 || (suspiciousReasons.length >= 1 && isPlaceholderText(row.company))) {
    routingStatus = 'suspicious';
    routingNote = suspiciousReasons.join('; ') + '.';
  } else if (routingMismatch) {
    routingStatus = 'mismatch';
    routingNote = `Intake says ${requestedService}, but answers/notes suggest ${detectedService}.`;
  } else if (suspiciousReasons.length === 1) {
    routingStatus = 'suspicious';
    routingNote = suspiciousReasons[0] + '.';
  }

  let action: AISuggestion['recommendedAction']['action'] = 'submit_to_supplier';
  let reasoning = 'Enough detail to send to suppliers for pricing.';
  let draftReply: string | undefined;

  if (routingStatus === 'suspicious' && suspiciousReasons.length >= 2) {
    action = 'close_spam';
    reasoning = 'Multiple signals of test or garbage data — review before spending supplier time.';
  } else if (routingStatus === 'mismatch') {
    action = 'escalate';
    reasoning = 'Service type mismatch — confirm routing before submitting to suppliers.';
  } else if (missing.length > 0) {
    action = 'request_info';
    reasoning = `Missing ${missing.length} required field${missing.length > 1 ? 's' : ''} — email customer before supplier RFQ.`;
    draftReply = buildDraftReply(row, missing);
  } else if (hasInstantPricingData(row)) {
    action = 'generate_quote';
    reasoning = 'UCaaS seat count and contact info present — instant pricing is available.';
  } else if (routingStatus === 'suspicious') {
    action = 'request_info';
    reasoning = 'One field looks off — confirm details with the customer first.';
    draftReply = buildDraftReply(row, ['Please confirm your company name and contact details']);
  }

  return {
    routingCheck: {
      status: routingStatus,
      detectedService,
      requestedService,
      note: routingNote,
    },
    recommendedAction: {
      action,
      reasoning,
    },
    draftReply,
  };
}
