import {
  normalizeContractDealStage,
  type ContractDealStage,
} from '@/lib/services/contract-submit-actions';

/** Customer-facing pipeline item after quote publish / accept. */
export type MemberQuotePipelineItem = {
  id: string;
  quoteRequestId: string | null;
  accountServiceId: string | null;
  serviceLabel: string;
  vendorName: string | null;
  stage: ContractDealStage;
  contractOpenPath: string | null;
  updatedAt: string;
};

const POST_ACCEPT_STAGES: ContractDealStage[] = [
  'quote_accepted',
  'supplier_contract_requested',
  'supplier_contract_received',
  'customer_contract_sent',
  'customer_contract_signed',
];

export function isPostAcceptPipelineStage(stage: ContractDealStage): boolean {
  return POST_ACCEPT_STAGES.includes(stage);
}

export type MemberQuotePipelineBannerContent = {
  title: string;
  sub: string;
  cta: string;
  tone: 'ready' | 'progress' | 'action';
  contractOpenPath: string | null;
  publishedQuoteId: string | null;
  navigate: 'savings' | 'services' | 'contract';
};

export function pipelineBannerContent(
  item: MemberQuotePipelineItem,
): MemberQuotePipelineBannerContent {
  const label = item.vendorName || item.serviceLabel;
  switch (item.stage) {
    case 'quote_accepted':
      return {
        title: 'Your quote has been accepted',
        sub: `Thanks for accepting ${label}. Please allow 24–48 hours for the Candid team to work with the supplier to prepare your agreement. You will be notified via email once it's ready.`,
        cta: 'View in My Services →',
        tone: 'progress',
        contractOpenPath: null,
        publishedQuoteId: item.quoteRequestId,
        navigate: 'services',
      };
    case 'supplier_contract_requested':
      return {
        title: 'Preparing your agreement',
        sub: `Candid is coordinating with the supplier for ${label}. We'll email you when your contract is ready to review — typically within 24–48 hours.`,
        cta: 'View status →',
        tone: 'progress',
        contractOpenPath: null,
        publishedQuoteId: item.quoteRequestId,
        navigate: 'services',
      };
    case 'supplier_contract_received':
      return {
        title: 'Your agreement is being finalized',
        sub: `We've received the supplier contract for ${label}. Candid is preparing it for your signature and will notify you by email when it's ready.`,
        cta: 'View in My Services →',
        tone: 'progress',
        contractOpenPath: null,
        publishedQuoteId: item.quoteRequestId,
        navigate: 'services',
      };
    case 'customer_contract_sent':
      return {
        title: 'Your contract is ready',
        sub: `Your agreement for ${label} is ready to review and sign. Open the contract, complete signing with the vendor, then confirm in My Services so we can activate your service.`,
        cta: 'Open contract →',
        tone: 'action',
        contractOpenPath: item.contractOpenPath,
        publishedQuoteId: item.quoteRequestId,
        navigate: 'contract',
      };
    case 'customer_contract_signed':
      return {
        title: 'Contract signed — finishing setup',
        sub: `Thanks for signing ${label}. Candid is completing activation and will notify you when your service is live in My Services.`,
        cta: 'View in My Services →',
        tone: 'progress',
        contractOpenPath: null,
        publishedQuoteId: item.quoteRequestId,
        navigate: 'services',
      };
    default:
      return {
        title: 'Quote update',
        sub: `We're working on ${label}.`,
        cta: 'View details →',
        tone: 'progress',
        contractOpenPath: null,
        publishedQuoteId: item.quoteRequestId,
        navigate: 'savings',
      };
  }
}

export function mapPipelineRow(row: {
  id: string;
  quote_request_id?: string | null;
  account_service_id?: string | null;
  service_label?: string | null;
  vendor_name?: string | null;
  status?: string | null;
  contract_storage_path?: string | null;
  contract_url?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}): MemberQuotePipelineItem | null {
  const stage = normalizeContractDealStage(row.status);
  if (!isPostAcceptPipelineStage(stage)) return null;
  const hasFile = Boolean(row.contract_storage_path?.trim());
  const hasUrl = Boolean(row.contract_url?.trim());
  const openPath = hasFile || hasUrl ? `/api/portal/contracts/${row.id}/file` : null;
  return {
    id: row.id,
    quoteRequestId: row.quote_request_id?.trim() || null,
    accountServiceId: row.account_service_id?.trim() || null,
    serviceLabel: row.service_label?.trim() || 'Your quote',
    vendorName: row.vendor_name?.trim() || null,
    stage,
    contractOpenPath: openPath,
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}
