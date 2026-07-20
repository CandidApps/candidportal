-- Plaid tech spend: linked bank/card items, accounts, and transactions for portal customers.

begin;

create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  connected_by_user_id uuid references auth.users (id) on delete set null,
  item_id text not null unique,
  access_token_enc text not null,
  institution_id text,
  institution_name text,
  products text[] not null default array['transactions']::text[],
  status text not null default 'active'
    check (status in ('active', 'login_required', 'error', 'removed')),
  sync_cursor text,
  last_synced_at timestamptz,
  error_code text,
  error_message text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plaid_items_customer_id_idx on public.plaid_items (customer_id);
create index if not exists plaid_items_status_idx on public.plaid_items (status);

create table if not exists public.plaid_accounts (
  id uuid primary key default gen_random_uuid(),
  item_row_id uuid not null references public.plaid_items (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  account_id text not null,
  name text,
  official_name text,
  mask text,
  type text,
  subtype text,
  iso_currency_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_row_id, account_id)
);

create index if not exists plaid_accounts_customer_id_idx on public.plaid_accounts (customer_id);

create table if not exists public.plaid_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  item_row_id uuid not null references public.plaid_items (id) on delete cascade,
  account_id text not null,
  transaction_id text not null unique,
  amount numeric(14, 2) not null,
  iso_currency_code text,
  date date not null,
  authorized_date date,
  name text,
  merchant_name text,
  pending boolean not null default false,
  plaid_category text[],
  personal_finance_category jsonb,
  payment_channel text,
  tech_category text,
  candid_related boolean,
  matched_service_hint text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plaid_transactions_customer_date_idx
  on public.plaid_transactions (customer_id, date desc);
create index if not exists plaid_transactions_tech_category_idx
  on public.plaid_transactions (customer_id, tech_category);
create index if not exists plaid_transactions_item_row_id_idx
  on public.plaid_transactions (item_row_id);

drop trigger if exists set_plaid_items_updated_at on public.plaid_items;
create trigger set_plaid_items_updated_at
before update on public.plaid_items
for each row execute function public.set_updated_at();

drop trigger if exists set_plaid_accounts_updated_at on public.plaid_accounts;
create trigger set_plaid_accounts_updated_at
before update on public.plaid_accounts
for each row execute function public.set_updated_at();

drop trigger if exists set_plaid_transactions_updated_at on public.plaid_transactions;
create trigger set_plaid_transactions_updated_at
before update on public.plaid_transactions
for each row execute function public.set_updated_at();

alter table public.plaid_items enable row level security;
alter table public.plaid_accounts enable row level security;
alter table public.plaid_transactions enable row level security;

-- Direct client access locked down; portal/admin APIs use the service role.
revoke all on table public.plaid_items from anon, authenticated;
revoke all on table public.plaid_accounts from anon, authenticated;
revoke all on table public.plaid_transactions from anon, authenticated;

grant select, insert, update, delete on table public.plaid_items to service_role;
grant select, insert, update, delete on table public.plaid_accounts to service_role;
grant select, insert, update, delete on table public.plaid_transactions to service_role;

commit;
