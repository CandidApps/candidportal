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

/** A normalized expense pulled back from Zoho Expense. */
export type ZohoExpense = {
  expenseId: string;
  amount: number;
  date: string | null;
  merchant: string | null;
  category: string | null;
  description: string | null;
  status: string | null;
};

type ZohoExpenseApiItem = {
  expense_id?: string;
  total?: number;
  amount?: number;
  date?: string;
  merchant_name?: string;
  category_name?: string;
  description?: string;
  status?: string;
};

function normalizeExpense(item: ZohoExpenseApiItem): ZohoExpense | null {
  if (!item.expense_id) return null;
  const amount = typeof item.total === 'number' ? item.total : Number(item.amount) || 0;
  return {
    expenseId: item.expense_id,
    amount,
    date: item.date ?? null,
    merchant: item.merchant_name ?? null,
    category: item.category_name ?? null,
    description: item.description ?? null,
    status: item.status ?? null,
  };
}

/**
 * Lists expenses from Zoho Expense, paging through results (capped) so expenses
 * created directly in the Zoho app can be imported back into the portal.
 */
export async function listZohoExpenses(input: {
  accessToken: string;
  /** Only return expenses on/after this ISO date (yyyy-mm-dd). */
  fromDate?: string | null;
  /** Safety cap on pages fetched (200/page). Defaults to 5 (≈1000 expenses). */
  maxPages?: number;
}): Promise<ZohoExpense[]> {
  const orgId = zohoExpenseOrgId();
  if (!orgId) throw new Error('Zoho Expense organization id is not configured.');

  const maxPages = Math.max(1, input.maxPages ?? 5);
  const out: ZohoExpense[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      organization_id: orgId,
      page: String(page),
      per_page: '200',
    });
    if (input.fromDate) {
      params.set('date_start', input.fromDate);
      params.set('date_end', new Date().toISOString().slice(0, 10));
    }

    const res = await fetch(`${expenseApiDomain()}/expense/v1/expenses?${params.toString()}`, {
      method: 'GET',
      headers: authHeaders(input.accessToken),
    });
    const json = (await res.json().catch(() => ({}))) as {
      expenses?: ZohoExpenseApiItem[];
      page_context?: { has_more_page?: boolean };
      message?: string;
    };
    if (!res.ok) {
      throw new Error(`Zoho Expense list failed (${res.status}): ${json.message ?? res.statusText}`);
    }
    for (const item of json.expenses ?? []) {
      const norm = normalizeExpense(item);
      if (norm) out.push(norm);
    }
    if (!json.page_context?.has_more_page) break;
  }

  return out;
}
