-- Record the associated account's agent on each expense so customer + agent are
-- tracked together (the account is chosen from a search, never free text).
alter table public.admin_expenses
  add column if not exists customer_agent text;
