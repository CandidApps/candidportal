/** True when PostgREST reports a missing table/column (schema cache) error. */
export function isSchemaCacheError(message: string, table?: string): boolean {
  if (!message) return false;
  if (/schema cache/i.test(message)) return true;
  if (table && message.includes(table)) return true;
  return false;
}

export const ADMIN_EXPENSES_MIGRATION_HINT =
  'My Expenses is not set up in the database yet. Apply Supabase migrations 0045_admin_expenses.sql and 0048_admin_expenses_customer_agent.sql (Supabase Dashboard → SQL Editor, or run: npm run db:apply-expenses with DATABASE_URL set).';

export function adminExpensesSchemaError(message: string): string | null {
  return isSchemaCacheError(message, 'admin_expenses') ? ADMIN_EXPENSES_MIGRATION_HINT : null;
}
