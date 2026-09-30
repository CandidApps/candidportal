import Anthropic from '@anthropic-ai/sdk';
import { getMyRole } from '@/lib/auth/roles';
import type { CustomerDocumentExtractResult } from '@/lib/customer-document-extract';
import { logClaudeUsageAsync, usageFromSdkMessage } from '@/lib/claude-usage';
import {
  MAX_PARSE_FILE_BYTES,
  MAX_PARSE_PDF_PAGES,
  formatFileSizeMb,
} from '@/lib/document-parse-limits';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;

const DOCUMENTS_BUCKET = 'candid_documents';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EXTRACTION_PROMPT = `You analyze business documents (contracts, proposals, W-9/tax forms, onboarding packets, invoices, statements) and extract CRM customer profile data.

Return ONLY a valid JSON object — no markdown, no backticks, no extra text.

{
  "companyName": string|null,
  "companyLegalName": string|null,
  "website": string|null,
  "street": string|null,
  "city": string|null,
  "state": string|null,
  "zip": string|null,
  "ein": string|null,
  "industry": string|null,
  "description": string|null,
  "mccCode": string|null,
  "corpType": string|null,
  "contactName": string|null,
  "contactEmail": string|null,
  "contactPhone": string|null,
  "contactRole": string|null
}

Rules:
- Use the merchant / customer / DBA / legal entity name on the document for companyName and companyLegalName when both appear.
- website should be a full URL when visible, otherwise null.
- Use 2-letter US state codes.
- ein should be formatted like 00-0000000 when present.
- description: one short sentence about what the business does (under 200 characters).
- corpType: LLC, S-Corp, C-Corp, Sole Proprietorship, Partnership, Non-Profit, or Other when stated.
- contact fields: primary signer, owner, or billing contact when identifiable.
- Return null for any field you cannot verify from the document. Do not invent data.`;

const CONTRACT_EXTRACTION_PROMPT = `You analyze telecom / IT service contracts and order forms (Comcast, RingCentral, Dialpad, Microsoft, merchant processing, etc.) and extract contract fields for a CRM.

Return ONLY a valid JSON object — no markdown, no backticks, no extra text.

{
  "provider": string|null,
  "service": string|null,
  "product": string|null,
  "serviceDescription": string|null,
  "pricingLineItems": [
    {
      "service": string,
      "cost": number,
      "quantity": number,
      "monthlyTotal": number,
      "chargeType": "recurring"|"one_time"|null,
      "billingFrequency": "monthly"|"bimonthly"|"quarterly"|"semiannual"|"annual"|null,
      "yearlyPrices": number[]|null
    }
  ],
  "mrc": number|null,
  "mrr": number|null,
  "estimatedTotalBill": number|null,
  "contractStartDate": string|null,
  "contractEndDate": string|null,
  "paySource": string|null,
  "dealId": string|null,
  "userCount": number|null,
  "renewalTerms": string|null
}

Rules:
- provider: solution vendor (e.g. Dialpad, Comcast Business, RingCentral). Prefer the billable carrier/SaaS brand over integrations mentioned in scope.
- service: service category / family (e.g. UCaaS, Internet, Merchant Processing, Microsoft 365) — short label, not a product dump.
- product: primary plan or product name (e.g. Dialpad Connect Pro).
- serviceDescription: concise scope-of-services narrative for internal Candid reference (integrations, migrations, included features). Do NOT paste the pricing table or seat counts here.
- pricingLineItems: one row per priced line from the contract pricing / order table. Columns:
  - service: line label (seat type, add-on, fee name)
  - cost: unit price before tax PER BILLING PERIOD (e.g. the annual price for an annually billed line; the one-time amount for a setup fee). For ramped lines, the year-1 price.
  - quantity: seats / units
  - monthlyTotal: normalized monthly amount before tax — cost × quantity ÷ months in the billing period (0 for one-time lines)
  - chargeType: "one_time" for setup / installation / hardware / upfront fees; "recurring" otherwise. null if unclear.
  - billingFrequency: how often a recurring line is billed. null if not stated (assumed monthly).
  - yearlyPrices: only when the unit price changes by contract year (e.g. [20, 22, 24] for years 1–3); otherwise null.
  Include taxes/fees as their own rows only when itemized. Empty array if no pricing table is visible.
- mrc: total monthly recurring charge BEFORE tax (sum of recurring lines before tax when available).
- mrr: same as mrc when used interchangeably; otherwise commissionable monthly amount.
- estimatedTotalBill: monthly total including estimated tax when shown separately; otherwise null.
- contractStartDate / contractEndDate: ISO YYYY-MM-DD when visible.
- paySource: master agent or channel if stated (Sandler, Telarus, etc.).
- dealId: account number, order ID, or deal UID when visible.
- userCount: total seats/users/licenses when stated.
- renewalTerms: auto-renewal, notice period, month-to-month, etc. when stated.
- Return null for fields you cannot verify. Do not invent data.`;

function pickString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function normalizeState(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  return s.length === 2 ? s.toUpperCase() : s;
}

function parseResult(raw: Record<string, unknown>): CustomerDocumentExtractResult {
  return {
    companyName: pickString(raw.companyName),
    companyLegalName: pickString(raw.companyLegalName),
    website: pickString(raw.website),
    street: pickString(raw.street),
    city: pickString(raw.city),
    state: normalizeState(pickString(raw.state)),
    zip: pickString(raw.zip),
    ein: pickString(raw.ein),
    industry: pickString(raw.industry),
    description: pickString(raw.description)?.slice(0, 240),
    mccCode: pickString(raw.mccCode)?.replace(/\D/g, '').slice(0, 4) || undefined,
    corpType: pickString(raw.corpType),
    contactName: pickString(raw.contactName),
    contactEmail: pickString(raw.contactEmail),
    contactPhone: pickString(raw.contactPhone),
    contactRole: pickString(raw.contactRole),
    source: 'ai',
  };
}

function hasExtractData(result: CustomerDocumentExtractResult): boolean {
  return Boolean(
    result.companyName ||
      result.companyLegalName ||
      result.website ||
      result.street ||
      result.city ||
      result.industry ||
      result.ein ||
      result.contactName ||
      result.contactEmail,
  );
}

function parseContractResult(raw: Record<string, unknown>) {
  const num = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[$,]/g, ''));
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };
  const pricingRaw = Array.isArray(raw.pricingLineItems)
    ? raw.pricingLineItems
    : Array.isArray(raw.lineItems)
      ? raw.lineItems
      : [];
  const pricingLineItems = pricingRaw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const service = pickString(r.service, r.name, r.product, r.label);
      const cost = num(r.cost) ?? num(r.unitPrice) ?? num(r.unit_price) ?? num(r.rate) ?? 0;
      const quantity = num(r.quantity) ?? num(r.qty) ?? num(r.seats) ?? 1;
      const monthlyTotal =
        num(r.monthlyTotal) ?? num(r.monthly_total) ?? num(r.subtotal) ?? num(r.total) ?? cost * quantity;
      if (!service && !cost && !monthlyTotal) return null;
      const yearlyPrices = Array.isArray(r.yearlyPrices)
        ? r.yearlyPrices.map(num).filter((p): p is number => p != null)
        : undefined;
      return {
        service: service || 'Line item',
        cost,
        quantity,
        monthlyTotal: Math.round(monthlyTotal * 100) / 100,
        chargeType: pickString(r.chargeType),
        billingFrequency: pickString(r.billingFrequency),
        yearlyPrices: yearlyPrices && yearlyPrices.length > 1 ? yearlyPrices : undefined,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    provider: pickString(raw.provider, raw.solution, raw.vendor),
    service: pickString(raw.service),
    product: pickString(raw.product),
    serviceDescription: pickString(raw.serviceDescription, raw.scopeOfServices, raw.description),
    pricingLineItems,
    mrc: num(raw.mrc) ?? num(raw.mrr),
    mrr: num(raw.mrr) ?? num(raw.mrc),
    estimatedTotalBill: num(raw.estimatedTotalBill) ?? num(raw.totalWithTax),
    contractStartDate: pickString(raw.contractStartDate),
    contractEndDate: pickString(raw.contractEndDate),
    paySource: pickString(raw.paySource),
    dealId: pickString(raw.dealId),
    userCount: num(raw.userCount) ?? num(raw.seatCount) ?? num(raw.licenses),
    renewalTerms: pickString(raw.renewalTerms, raw.renewalTerm),
  };
}

function hasContractData(contract: ReturnType<typeof parseContractResult>): boolean {
  return Boolean(
    contract.provider ||
      contract.product ||
      contract.service ||
      contract.serviceDescription ||
      contract.mrc ||
      contract.contractStartDate ||
      contract.contractEndDate ||
      contract.dealId ||
      (contract.pricingLineItems && contract.pricingLineItems.length > 0),
  );
}

/** Prefer full JSON; fall back to first {...} slice when the model wraps or truncates. */
function extractJson(text: string): Record<string, unknown> {
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean) as Record<string, unknown>;
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('Model returned invalid JSON');
  }
}

async function countPdfPages(bytes: Buffer): Promise<number | null> {
  try {
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    const parsed = await mod.default(bytes);
    return typeof parsed.numpages === 'number' ? parsed.numpages : null;
  } catch {
    return null;
  }
}

function mediaTypeForStoredPath(path: string, blobType: string): string | null {
  const type = blobType.toLowerCase();
  if (type === 'application/pdf' || type.startsWith('image/')) return type === 'image/jpg' ? 'image/jpeg' : type;
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png' || ext === 'webp' || ext === 'gif') return `image/${ext}`;
  return null;
}

/** Maps Anthropic size / length rejections to an actionable message; null when unrelated. */
function documentLimitMessage(err: unknown): string | null {
  const status = err instanceof Anthropic.APIError ? err.status : undefined;
  const message = err instanceof Error ? err.message : '';
  if (status === 413 || /request too large|payload/i.test(message)) {
    return 'Document is too large to parse. Split out the contract pages, or enter details manually.';
  }
  if (/prompt is too long|too many tokens|maximum of \d+ PDF pages|pages? (limit|exceed)/i.test(message)) {
    return `Document is too long to parse in one pass (the parser reads up to ${MAX_PARSE_PDF_PAGES} pages). Split out the contract pages, or enter details manually.`;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      data?: string;
      mediaType?: string;
      filename?: string;
      extractMode?: 'customer' | 'contract';
      /** Parse a file already in the documents bucket instead of sending bytes (avoids request size limits). */
      storagePath?: string;
    };
    const { filename, extractMode } = body;
    let { data, mediaType } = body;
    let bytes: Buffer | null = null;

    if (!data && body.storagePath) {
      if ((await getMyRole()) !== 'admin') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const storagePath = body.storagePath.trim();
      if (!storagePath || storagePath.includes('..')) {
        return Response.json({ error: 'Invalid document path' }, { status: 400 });
      }
      const { data: blob, error } = await createSupabaseAdminClient()
        .storage.from(DOCUMENTS_BUCKET)
        .download(storagePath);
      if (error || !blob) {
        return Response.json(
          { error: 'The saved file could not be found — use Replace to upload it again.' },
          { status: 404 },
        );
      }
      bytes = Buffer.from(await blob.arrayBuffer());
      mediaType = mediaType || mediaTypeForStoredPath(storagePath, blob.type) || undefined;
      data = bytes.toString('base64');
    }

    if (!data || !mediaType) {
      return Response.json({ error: 'No document data provided' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'Document parsing is not configured. Please contact support.' },
        { status: 503 },
      );
    }

    const isPdf = mediaType === 'application/pdf';
    const isImage = mediaType.startsWith('image/');

    if (!isPdf && !isImage) {
      return Response.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    bytes ??= Buffer.from(data, 'base64');
    if (bytes.length > MAX_PARSE_FILE_BYTES) {
      return Response.json(
        {
          error: `Document is ${formatFileSizeMb(bytes.length)} — the parser accepts up to ${formatFileSizeMb(MAX_PARSE_FILE_BYTES)}. Split out the contract pages, or enter details manually.`,
        },
        { status: 413 },
      );
    }
    if (isPdf) {
      const pages = await countPdfPages(bytes);
      if (pages != null && pages > MAX_PARSE_PDF_PAGES) {
        return Response.json(
          {
            error: `This PDF has ${pages} pages — the parser reads up to ${MAX_PARSE_PDF_PAGES}. Split out the contract pages (e.g. the signed agreement), or enter details manually.`,
          },
          { status: 422 },
        );
      }
    }

    // Contract extracts include pricingLineItems and need more room than profile fields.
    const maxTokens = extractMode === 'contract' ? 4096 : 1024;

    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [
      isPdf
        ? {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data,
            },
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data,
            },
          },
      {
        type: 'text',
        text: `${extractMode === 'contract' ? CONTRACT_EXTRACTION_PROMPT : EXTRACTION_PROMPT}\n\nFilename: ${filename ?? 'unknown'}`,
      },
    ];

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    });

    logClaudeUsageAsync({
      routeLabel: 'parse-customer-document',
      usage: usageFromSdkMessage(message),
      maxTokens,
      usageTrigger: extractMode === 'contract' ? 'contract' : 'customer',
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return Response.json({ error: 'No text response from model' }, { status: 500 });
    }

    if (message.stop_reason === 'max_tokens') {
      console.warn(
        '[parse-customer-document] Response truncated (max_tokens). filename=%s mode=%s',
        filename,
        extractMode,
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = extractJson(textBlock.text);
    } catch (parseErr) {
      console.error('[parse-customer-document] JSON parse failed:', parseErr, {
        stopReason: message.stop_reason,
        preview: textBlock.text.slice(0, 400),
      });
      return Response.json(
        {
          error:
            message.stop_reason === 'max_tokens'
              ? 'Document is too dense to parse in one pass. Try a shorter excerpt, or enter contract details manually.'
              : 'Document parsing failed. Please check the file and try again.',
        },
        { status: 500 },
      );
    }

    const partial = message.stop_reason === 'max_tokens';

    if (extractMode === 'contract') {
      const contract = parseContractResult(parsed);
      if (!hasContractData(contract)) {
        return Response.json({ contract: null, partial });
      }
      return Response.json({ contract, partial });
    }

    const result = parseResult(parsed);

    if (!hasExtractData(result)) {
      return Response.json({ result: { source: 'none' as const } });
    }

    return Response.json({ result });
  } catch (err) {
    console.error('[parse-customer-document] Error:', err);
    const message = err instanceof Error ? err.message : '';
    const isTimeout = /timeout|timed out|ETIMEDOUT|AbortError/i.test(message);
    const limitMessage = documentLimitMessage(err);
    return Response.json(
      {
        error: isTimeout
          ? 'Document parsing timed out. Try again, or enter details manually.'
          : limitMessage ?? 'Document parsing failed. Please check the file and try again.',
      },
      { status: limitMessage ? 413 : 500 },
    );
  }
}
