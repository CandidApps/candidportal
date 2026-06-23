import Anthropic from '@anthropic-ai/sdk';
import type { CustomerDocumentExtractResult } from '@/lib/customer-document-extract';

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

const CONTRACT_EXTRACTION_PROMPT = `You analyze telecom / IT service contracts and order forms (Comcast, RingCentral, Microsoft, merchant processing, etc.) and extract contract fields for a CRM.

Return ONLY a valid JSON object — no markdown, no backticks, no extra text.

{
  "provider": string|null,
  "product": string|null,
  "serviceDescription": string|null,
  "mrc": number|null,
  "mrr": number|null,
  "contractStartDate": string|null,
  "contractEndDate": string|null,
  "paySource": string|null,
  "dealId": string|null,
  "userCount": number|null,
  "renewalTerms": string|null
}

Rules:
- provider: solution vendor (e.g. Comcast Business, RingCentral, Vonage).
- product: plan or product name when stated.
- serviceDescription: short summary of services (speed, seats, etc.).
- mrc/mrr: monthly recurring charge in dollars as a number (no currency symbol).
- contractStartDate / contractEndDate: ISO YYYY-MM-DD when visible.
- paySource: master agent or channel if stated (Sandler, Telarus, etc.).
- dealId: account number, order ID, or deal UID when visible.
- userCount: seats, users, licenses, or lines when stated.
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
  return {
    provider: pickString(raw.provider, raw.solution, raw.vendor),
    product: pickString(raw.product),
    serviceDescription: pickString(raw.serviceDescription, raw.service),
    mrc: num(raw.mrc) ?? num(raw.mrr),
    mrr: num(raw.mrr) ?? num(raw.mrc),
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
      contract.mrc ||
      contract.contractEndDate ||
      contract.dealId,
  );
}

export async function POST(request: Request) {
  try {
    const { data, mediaType, filename, extractMode } = (await request.json()) as {
      data?: string;
      mediaType?: string;
      filename?: string;
      extractMode?: 'customer' | 'contract';
    };

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
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return Response.json({ error: 'No text response from model' }, { status: 500 });
    }

    const clean = textBlock.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as Record<string, unknown>;

    if (extractMode === 'contract') {
      const contract = parseContractResult(parsed);
      if (!hasContractData(contract)) {
        return Response.json({ contract: null });
      }
      return Response.json({ contract });
    }

    const result = parseResult(parsed);

    if (!hasExtractData(result)) {
      return Response.json({ result: { source: 'none' as const } });
    }

    return Response.json({ result });
  } catch (err) {
    console.error('[parse-customer-document] Error:', err);
    return Response.json(
      { error: 'Document parsing failed. Please check the file and try again.' },
      { status: 500 },
    );
  }
}
