import type { Customer } from '@/components/CustomersView';
import type { Lead } from '@/components/LeadsView';
import type { AdminInitiatedQuoteSource } from '@/lib/services/admin-initiated-quote-request';

export async function startAdminInitiatedQuoteRequest(opts: {
  source: AdminInitiatedQuoteSource;
  customerExternalId?: string;
  portalLeadRowId?: string;
  leadId?: string;
  mode?: 'request' | 'add-services';
  customerSnapshot?: Customer;
  leadSnapshot?: Lead;
}): Promise<{ quoteRequestId: string }> {
  const res = await fetch('/api/admin/quote-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const data = (await res.json().catch(() => ({}))) as {
    quoteRequestId?: string;
    error?: string;
  };
  if (!res.ok || !data.quoteRequestId) {
    throw new Error(data.error ?? 'Could not start quote');
  }
  return { quoteRequestId: data.quoteRequestId };
}
