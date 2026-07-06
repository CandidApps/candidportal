import type { MerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';

export type AnalysisTicketStatus = 'open' | 'resolved';

export type AnalysisTicketRow = {
  id: string;
  user_id: string;
  account_service_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  merchant_name: string | null;
  question: string;
  last_ai_reply: string | null;
  status: AnalysisTicketStatus;
  analysis_context: MerchantAnalysisSnapshot | null;
  created_at: string;
  updated_at: string;
};

export async function fetchAnalysisTicketsForAdmin(): Promise<AnalysisTicketRow[]> {
  const res = await fetch('/api/admin/analysis-tickets');
  if (!res.ok) {
    console.error('fetchAnalysisTicketsForAdmin', await res.text());
    return [];
  }
  const data = (await res.json()) as { tickets?: AnalysisTicketRow[] };
  return data.tickets ?? [];
}

export function formatTicketTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
