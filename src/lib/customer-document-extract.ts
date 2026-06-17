import type { Dispatch, SetStateAction } from 'react';
import type { RecordKind } from '@/lib/customer-records';
import { parseContractHintsFromFile } from '@/lib/customer-records';
import { fileToBase64 } from '@/lib/candid-pay/statementParser';

export type CustomerDocumentExtractResult = {
  companyName?: string;
  companyLegalName?: string;
  website?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  ein?: string;
  industry?: string;
  description?: string;
  mccCode?: string;
  corpType?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactRole?: string;
  source: 'ai' | 'filename' | 'none';
};

export type CustomerDraftValues = {
  companyFriendly: string;
  companyLegal: string;
  website: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  ein: string;
  industry: string;
  description: string;
  mccCode: string;
  corpType: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactRole: string;
};

export type CustomerDraftSetters = {
  addressEdited: boolean;
  setCompanyFriendly: Dispatch<SetStateAction<string>>;
  setCompanyLegal: Dispatch<SetStateAction<string>>;
  setWebsite: Dispatch<SetStateAction<string>>;
  setStreet: Dispatch<SetStateAction<string>>;
  setCity: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<string>>;
  setZip: Dispatch<SetStateAction<string>>;
  setEin: Dispatch<SetStateAction<string>>;
  setIndustry: Dispatch<SetStateAction<string>>;
  setDescription: Dispatch<SetStateAction<string>>;
  setMccCode: Dispatch<SetStateAction<string>>;
  setCorpType: Dispatch<SetStateAction<string>>;
  setContactName: Dispatch<SetStateAction<string>>;
  setContactEmail: Dispatch<SetStateAction<string>>;
  setContactPhone: Dispatch<SetStateAction<string>>;
  setContactRole: Dispatch<SetStateAction<string>>;
};

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

function hintsFromFilename(file: File): CustomerDocumentExtractResult {
  const hints = parseContractHintsFromFile(file);
  const name = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(contract|proposal|invoice|statement|w9|w-9)\b/gi, '')
    .trim();
  return {
    companyName: name.length > 2 ? name : undefined,
    source: 'filename',
  };
}

export function guessRecordKindFromFile(file: File): RecordKind {
  const name = file.name.toLowerCase();
  if (/w-?9|tax|ein/.test(name)) return 'other';
  if (/statement/.test(name)) return 'statement';
  if (/invoice/.test(name)) return 'invoice';
  if (/proposal/.test(name)) return 'proposal';
  if (/candid/.test(name)) return 'candid_contract';
  if (/contract|agreement|msa|sow/.test(name)) return 'external_contract';
  return 'other';
}

export function mediaTypeForCustomerDocument(file: File): string | null {
  const type = file.type.toLowerCase();
  if (type === 'application/pdf') return 'application/pdf';
  if (type === 'image/jpeg' || type === 'image/jpg') return 'image/jpeg';
  if (type === 'image/png') return 'image/png';
  if (type === 'image/webp') return 'image/webp';
  if (type === 'image/gif') return 'image/gif';

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return null;
}

export function applyCustomerDocumentExtract(
  result: CustomerDocumentExtractResult,
  current: CustomerDraftValues,
  opts: CustomerDraftSetters,
): { profileFound: boolean; addressFound: boolean } {
  const setIfEmpty = (
    value: string | undefined,
    currentVal: string,
    setter: Dispatch<SetStateAction<string>>,
  ) => {
    if (value && !currentVal.trim()) setter(value);
  };

  setIfEmpty(result.companyName, current.companyFriendly, opts.setCompanyFriendly);
  setIfEmpty(result.companyLegalName ?? result.companyName, current.companyLegal, opts.setCompanyLegal);
  setIfEmpty(result.website, current.website, opts.setWebsite);

  if (!opts.addressEdited) {
    setIfEmpty(result.street, current.street, opts.setStreet);
    setIfEmpty(result.city, current.city, opts.setCity);
    setIfEmpty(result.state, current.state, opts.setState);
    setIfEmpty(result.zip, current.zip, opts.setZip);
  }

  setIfEmpty(result.ein, current.ein, opts.setEin);
  setIfEmpty(result.industry, current.industry, opts.setIndustry);
  setIfEmpty(result.description, current.description, opts.setDescription);
  setIfEmpty(result.mccCode, current.mccCode, opts.setMccCode);
  setIfEmpty(result.corpType, current.corpType, opts.setCorpType);
  setIfEmpty(result.contactName, current.contactName, opts.setContactName);
  setIfEmpty(result.contactEmail, current.contactEmail, opts.setContactEmail);
  setIfEmpty(result.contactPhone, current.contactPhone, opts.setContactPhone);
  setIfEmpty(result.contactRole, current.contactRole, opts.setContactRole);

  const addressFound = Boolean(result.street || result.city || result.state || result.zip);
  const profileFound = Boolean(
    result.companyName ||
      result.companyLegalName ||
      result.website ||
      result.industry ||
      result.description ||
      result.mccCode ||
      result.ein ||
      result.contactName ||
      result.contactEmail,
  );
  return { addressFound, profileFound };
}

export function formatDocumentExtractNote(
  result: CustomerDocumentExtractResult,
  opts: { addressEdited: boolean; addressFound: boolean; profileFound: boolean },
): string {
  if (result.source === 'filename') {
    return 'Limited hints from filename only — upload a PDF or image for full AI extraction, or enter details manually.';
  }
  if (!opts.profileFound && !opts.addressFound) {
    return 'Could not read company details from this document. Enter information manually.';
  }
  const parts: string[] = [];
  if (opts.profileFound) parts.push('company profile');
  if (opts.addressFound) parts.push('address');
  if (result.contactName || result.contactEmail) parts.push('contact');
  const summary = `Prefilled ${parts.join(', ')} from document`;
  if (opts.addressEdited && opts.addressFound) {
    return `${summary}. Address fields were left unchanged because you already edited them.`;
  }
  return `${summary} — please verify before saving.`;
}

export async function parseCustomerDocumentFromFile(
  file: File,
): Promise<CustomerDocumentExtractResult> {
  const mediaType = mediaTypeForCustomerDocument(file);
  if (!mediaType) {
    return hintsFromFilename(file);
  }

  const base64 = await fileToBase64(file);
  const res = await fetch('/api/parse-customer-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: base64,
      mediaType,
      filename: file.name,
    }),
  });

  if (!res.ok) {
    const fallback = hintsFromFilename(file);
    if (fallback.companyName) return fallback;
    throw new Error(
      res.status === 503
        ? 'Document parsing is not configured on the server.'
        : 'Could not read this document. Try a PDF or image, or enter details manually.',
    );
  }

  const body = (await res.json()) as { result?: CustomerDocumentExtractResult; error?: string };
  if (body.error) throw new Error(body.error);
  const result = body.result;
  if (!result || result.source === 'none') {
    const fallback = hintsFromFilename(file);
    return fallback.companyName ? fallback : { source: 'none' };
  }

  return {
    ...result,
    state: normalizeState(result.state),
    source: 'ai',
  };
}
