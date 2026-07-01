-- Link admin expenses to the commission workflow so bank-deposit lines classified
-- as "Expense" surface in both "My Expenses" and the period's Expenses tab (step 3).
alter table public.admin_expenses
  add column if not exists commission_period text,
  add column if not exists bank_deposit_import_id bigint;

create index if not exists admin_expenses_commission_period_idx
  on public.admin_expenses (commission_period)
  where commission_period is not null;

create index if not exists admin_expenses_bank_import_idx
  on public.admin_expenses (bank_deposit_import_id)
  where bank_deposit_import_id is not null;
