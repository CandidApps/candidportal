import type { ContractDocumentExtractResult } from '@/lib/contract-document-extract';
import { parseContractDocumentFromFile } from '@/lib/contract-document-extract';
import { parseBillFromFile } from '@/lib/bill-parse';
import { mediaTypeForCustomerDocument } from '@/lib/customer-document-extract';

export type ExternalServiceDraft = {
  supplierName: string;
  serviceName: string;
  serviceDescription: string;
  userCount: string;
  monthlyAmount: string;
  contractStartDate: string;
  contractEndDate: string;
  renewalTerms: string;
  interestedInAlternatives: boolean;
};

export const EMPTY_EXTERNAL_SERVICE_DRAFT: ExternalServiceDraft = {
  supplierName: '',
  serviceName: '',
  serviceDescription: '',
  userCount: '',
  monthlyAmount: '',
  contractStartDate: '',
  contractEndDate: '',
  renewalTerms: '',
  interestedInAlternatives: false,
};

function isoDateOnly(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function applyContractExtract(draft: ExternalServiceDraft, contract: ContractDocumentExtractResult): ExternalServiceDraft {
  return {
    ...draft,
    supplierName: contract.provider ?? draft.supplierName,
    serviceName: contract.product ?? draft.serviceName,
    serviceDescription: contract.serviceDescription ?? draft.serviceDescription,
    userCount: contract.userCount != null ? String(contract.userCount) : draft.userCount,
    monthlyAmount:
      contract.mrc != null ? String(contract.mrc) : contract.mrr != null ? String(contract.mrr) : draft.monthlyAmount,
    contractStartDate: contract.contractStartDate ? isoDateOnly(contract.contractStartDate) : draft.contractStartDate,
    contractEndDate: contract.contractEndDate ? isoDateOnly(contract.contractEndDate) : draft.contractEndDate,
    renewalTerms: contract.renewalTerms ?? draft.renewalTerms,
  };
}

function isBillLikeFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return /invoice|bill|statement|receipt/.test(name);
}

export async function extractExternalServiceFromFile(
  file: File,
  draft: ExternalServiceDraft,
): Promise<ExternalServiceDraft> {
  const isContractMedia = Boolean(mediaTypeForCustomerDocument(file));
  if (isContractMedia && !isBillLikeFile(file)) {
    const contract = await parseContractDocumentFromFile(file);
    return applyContractExtract(draft, contract);
  }

  const hintName = draft.serviceName || draft.supplierName;
  const bill = await parseBillFromFile(file, hintName);
  let next = { ...draft };
  if (bill.vendorName) next.supplierName = bill.vendorName;
  if (bill.serviceName) next.serviceName = bill.serviceName;
  if (bill.summary) next.serviceDescription = bill.summary;
  if (bill.monthlyAmount != null) next.monthlyAmount = String(bill.monthlyAmount);
  return next;
}

export function draftFromServiceCard(svc: {
  name: string;
  vendor: string;
  amount?: string;
  serviceDescription?: string;
  userCount?: number | null;
  contractStartDate?: string;
  contractEndDate?: string;
  renewalTerms?: string;
  interestedInAlternatives?: boolean;
}): ExternalServiceDraft {
  const monthly = svc.amount?.replace(/[^\d.]/g, '') ?? '';
  return {
    supplierName: svc.vendor.split(' — ')[0]?.trim() ?? svc.vendor,
    serviceName: svc.name,
    serviceDescription: svc.serviceDescription ?? '',
    userCount: svc.userCount != null ? String(svc.userCount) : '',
    monthlyAmount: monthly,
    contractStartDate: svc.contractStartDate ? isoDateOnly(svc.contractStartDate) : '',
    contractEndDate: svc.contractEndDate ? isoDateOnly(svc.contractEndDate) : '',
    renewalTerms: svc.renewalTerms ?? '',
    interestedInAlternatives: svc.interestedInAlternatives ?? false,
  };
}

export function parseMonthlyCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function parseUserCount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function computeExternalServiceStatus(expiresAt: string | null): 'external' | 'expiring' {
  if (!expiresAt) return 'external';
  const end = new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return 'external';
  const days = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return days <= 90 ? 'expiring' : 'external';
}
