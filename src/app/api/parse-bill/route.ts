import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getMyRole } from '@/lib/auth/roles';
import { mapRawBillParse } from '@/lib/bill-parse';

export const maxDuration = 120;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MAX_BYTES = 12 * 1024 * 1024;

const BILL_PARSE_PROMPT = `You analyze business bills, invoices, and statements for a technology cost optimization platform.

Classify the document and extract key fields. Return ONLY valid JSON — no markdown.

{
  "category": "merchant_services | internet | ucaas | ccaas | mobility | security | cloud_saas | payments_ach | hardware | managed_it | other",
  "categoryLabel": string,
  "confidence": "high | medium | low",
  "vendorName": string|null,
  "serviceName": string|null,
  "monthlyAmount": number|null,
  "summary": string|null,
  "lineItems": [{"label": string, "value": string, "quantity": string|null}]|null,
  "flags": [{"question": string, "severity": "medium"|"high"}]|null,
  "merchantData": object|null,
  "ucaasData": object|null
}

vendorName rules:
- The company that ISSUED the bill or provides the service (payment processor, ISP, phone carrier, etc.)
- For merchant card processing: use the processor brand (e.g. Worldpay, FISERV, Elavon) — NOT the merchant DBA, NOT the MID, NOT the filename
- Never use upload filenames, statement reference IDs, or strings like "0JZ681-BIMERFIN-01-08-2026-1686906110"
- If only the merchant business name is visible and no processor brand, use null

Category rules:
- merchant_services: card processing statements with volume, interchange, processing fees, MID, effective rate
- internet: ISP, broadband, fiber, coax business internet
- ucaas: VoIP, unified communications, RingCentral, Vonage, Dialpad, phone seats
- ccaas: contact center, call center platforms
- mobility: wireless, cellular business lines
- security: firewall, SOC, EDR, cybersecurity services
- cloud_saas: cloud hosting, backup, SaaS subscriptions (non-phone)
- payments_ach: ACH, eCheck, payment gateway (not card processing statements)
- hardware: equipment leases, device purchases on recurring bills
- managed_it: MSP, managed services, IT support contracts
- other: cannot determine

merchantData: ONLY when category is merchant_services. Use this shape:
{
  "processorName": string|null,
  "merchantName": string,
  "statementDate": "MM/YYYY",
  "totalVolume": number,
  "totalFees": number,
  "transactionCount": number,
  "avgTicket": number,
  "feeBreakdown": {
    "interchange": number,
    "processingMarkup": number,
    "networkFees": number,
    "nonQualSurcharge": number,
    "authFees": number,
    "bascStand": number,
    "stmtMail": number,
    "acctFee": number,
    "otherFixed": number
  },
  "pricingModel": "interchange_plus | tiered | flat_rate | dual_pricing | cash_discount",
  "pricingModelEvidence": string,
  "processingMarkupBps": number,
  "effectiveRate": number
}

processorName: the card processor / acquirer brand printed on the statement (Worldpay, FISERV, Elavon, etc.) — not the merchant name.

lineItems: 3–12 scannable rows from the bill (plan name, seat/line counts, recurring charges, equipment, taxes, usage). Use quantity when a count is visible (e.g. "8 phone lines"). value should be human-readable (amounts as "$123.45" or counts as plain numbers).

flags: ONLY when something is ambiguous or mismatched (e.g. 8 phone lines but 1 seat license). Each flag is a direct question for the customer. Use severity "high" when the mismatch could change the quote materially.

ucaasData: ONLY when category is ucaas. Extract every telephone number on the bill (DIDs, main lines, fax, toll-free). Use this shape:
{
  "phoneLines": [
    {"number": string, "label": string|null, "isPrimary": boolean}
  ]
}
- number: as printed on the bill, formatted like (555) 123-4567 when possible
- label: optional context (Main, Fax, Toll-free, User name, etc.)
- isPrimary: true for exactly one line that appears to be the main/account number; false for others
- Include all distinct numbers found; do not invent numbers

Do not invent numbers. Use null when unknown.`;

function guessMediaType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

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

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Bill parsing is not configured' }, { status: 503 });
  }

  try {
    const contentType = request.headers.get('content-type') ?? '';
    let data: string;
    let mediaType: string;
    let filename = 'bill.pdf';

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File) || !file.size) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: 'File is too large (max 12 MB)' }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      data = buffer.toString('base64');
      mediaType = file.type || guessMediaType(file.name);
      filename = file.name;
    } else {
      const body = (await request.json()) as { data?: string; mediaType?: string; filename?: string };
      if (!body.data) return NextResponse.json({ error: 'No document data' }, { status: 400 });
      data = body.data;
      mediaType = body.mediaType || 'application/pdf';
      filename = body.filename || filename;
    }

    const isPdf = mediaType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
    const isImage = mediaType.startsWith('image/');
    if (!isPdf && !isImage) {
      return NextResponse.json({ error: 'Upload a PDF or image bill' }, { status: 400 });
    }

    const resolvedImageType = (
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)
        ? mediaType
        : 'image/png'
    ) as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [
      isPdf
        ? {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data },
          }
        : {
            type: 'image',
            source: { type: 'base64', media_type: resolvedImageType, data },
          },
      { type: 'text', text: `${BILL_PARSE_PROMPT}\n\nUpload filename (for reference only — do not use as vendorName): ${filename}` },
    ];

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No parse response' }, { status: 500 });
    }

    const result = mapRawBillParse(extractJson(textBlock.text), { filename });
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    console.error('[parse-bill]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
