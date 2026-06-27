import 'server-only';

/**
 * Thin Zoho Expense REST client. Reuses the Zoho OAuth access token obtained for
 * the user's mailbox connection (the `ZohoExpense.fullaccess.all` scope must have
 * been granted at consent — see ZOHO_SCOPES).
 *
 * Docs: https://www.zoho.com/expense/api/v1/
 */

function expenseApiDomain(): string {
  return process.env.ZOHO_EXPENSE_API_DOMAIN ?? 'https://www.zohoapis.com';
}

export function zohoExpenseOrgId(): string | null {
  return process.env.ZOHO_EXPENSE_ORG_ID?.trim() || null;
}

export function isZohoExpenseConfigured(): boolean {
  return Boolean(zohoExpenseOrgId());
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    Accept: 'application/json',
  };
}

export type CreateZohoExpenseInput = {
  accessToken: string;
  /** Amount in the org's base currency. */
  amount: number;
  /** ISO date (yyyy-mm-dd). Defaults to today when omitted. */
  date?: string | null;
  /** Free-text category/description shown in Zoho. */
  category?: string | null;
  merchant?: string | null;
  description?: string | null;
  /** Reference back to the Candid customer/account for tracking. */
  customerName?: string | null;
};

/** Creates an unreported expense in Zoho Expense; returns the new expense id. */
export async function createZohoExpense(input: CreateZohoExpenseInput): Promise<string> {
  const orgId = zohoExpenseOrgId();
  if (!orgId) throw new Error('Zoho Expense organization id is not configured.');

  const date = input.date || new Date().toISOString().slice(0, 10);
  const descParts = [input.merchant, input.description, input.customerName ? `Account: ${input.customerName}` : null]
    .filter(Boolean)
    .join(' — ');

  const payload: Record<string, unknown> = {
    date,
    amount: Number(input.amount) || 0,
    // Zoho Expense expects a category name/id; we pass the free-text category as
    // the description so it's never rejected for an unknown category id.
    description: descParts || input.category || 'Expense',
  };
  if (input.merchant) payload.merchant_name = input.merchant;

  const params = new URLSearchParams({ organization_id: orgId });
  const body = new URLSearchParams({ JSONString: JSON.stringify(payload) });

  const res = await fetch(`${expenseApiDomain()}/expense/v1/expenses?${params.toString()}`, {
    method: 'POST',
    headers: {
      ...authHeaders(input.accessToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as {
    expense?: { expense_id?: string };
    message?: string;
    code?: number;
  };
  if (!res.ok || !json.expense?.expense_id) {
    throw new Error(`Zoho Expense create failed (${res.status}): ${json.message ?? res.statusText}`);
  }
  return json.expense.expense_id;
}
