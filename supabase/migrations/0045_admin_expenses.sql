-- Admin "My Expenses" manual logging (TASK-032).
create table if not exists public.admin_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  merchant text,
  customer_id text,
  customer_name text,
  category text,
  amount numeric(12,2) not null default 0,
  spent_on date,
  note text,
  receipt_storage_path text,
  pull_from_commission boolean not null default false,
  zoho_expense_id text,
  status text not null default 'logged',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_expenses_owner_idx on public.admin_expenses (owner_id, created_at desc);

alter table public.admin_expenses enable row level security;

drop policy if exists "admin_expenses owner all" on public.admin_expenses;
create policy "admin_expenses owner all" on public.admin_expenses
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
