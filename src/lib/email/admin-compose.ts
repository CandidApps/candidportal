/** Launch the admin Zoho compose modal from anywhere in the admin shell. */
export type AdminComposeLaunch = {
  to?: string;
  cc?: string;
  subject: string;
  body?: string;
  html?: string;
  contextLabel?: string;
  marketingAssetIds?: string[];
  /** After successful send, PATCH supplier RFQ with sent status + body. */
  rfqId?: string;
  quoteRequestId?: string;
  quoteItemId?: string;
  /** After send, advance contract submit deal pipeline (or log-only for supplier_reply). */
  contractSubmitActionId?: string;
  contractSubmitIntent?: 'supplier' | 'customer' | 'supplier_reply';
  paySource?: string;
  paysourcePartnerId?: string;
  providerId?: string;
  vendorName?: string;
  supplierContactEmail?: string;
};

export const ADMIN_COMPOSE_EVENT = 'candid:admin-zoho-compose';
export const ADMIN_COMPOSE_SENT_EVENT = 'candid:admin-zoho-compose-sent';

export type AdminComposeSentDetail = {
  rfqId?: string;
  quoteRequestId?: string;
  quoteItemId?: string;
  contractSubmitActionId?: string;
  contractSubmitIntent?: 'supplier' | 'customer' | 'supplier_reply';
  paySource?: string;
  paysourcePartnerId?: string;
  providerId?: string;
  vendorName?: string;
  supplierContactEmail?: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
};

export function launchAdminZohoCompose(detail: AdminComposeLaunch) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AdminComposeLaunch>(ADMIN_COMPOSE_EVENT, { detail }));
}

export function notifyAdminComposeSent(detail: AdminComposeSentDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AdminComposeSentDetail>(ADMIN_COMPOSE_SENT_EVENT, { detail }));
}
