-- Personal outreach tracker: per-admin working lists of CRM accounts (team-visible read)

begin;

create table if not exists public.admin_outreach_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  customer_external_id text not null,
  status text not null default 'not_contacted'
    check (status in ('not_contacted', 'contacted', 'no_response', 'interested', 'closed')),
  knows_candid boolean,
  knows_what_we_do boolean,
  how_else_help text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, customer_external_id)
);

create index if not exists admin_outreach_accounts_owner_idx
  on public.admin_outreach_accounts (owner_user_id, sort_order, created_at desc);

create index if not exists admin_outreach_accounts_customer_idx
  on public.admin_outreach_accounts (customer_external_id);

drop trigger if exists set_admin_outreach_accounts_updated_at on public.admin_outreach_accounts;
create trigger set_admin_outreach_accounts_updated_at
before update on public.admin_outreach_accounts
for each row
execute function public.set_updated_at();

alter table public.admin_outreach_accounts enable row level security;

drop policy if exists "admin_outreach_admin_select" on public.admin_outreach_accounts;
create policy "admin_outreach_admin_select"
on public.admin_outreach_accounts for select to authenticated
using (public.is_admin());

drop policy if exists "admin_outreach_owner_insert" on public.admin_outreach_accounts;
create policy "admin_outreach_owner_insert"
on public.admin_outreach_accounts for insert to authenticated
with check (public.is_admin() and auth.uid() = owner_user_id);

drop policy if exists "admin_outreach_owner_update" on public.admin_outreach_accounts;
create policy "admin_outreach_owner_update"
on public.admin_outreach_accounts for update to authenticated
using (public.is_admin() and auth.uid() = owner_user_id)
with check (public.is_admin() and auth.uid() = owner_user_id);

drop policy if exists "admin_outreach_owner_delete" on public.admin_outreach_accounts;
create policy "admin_outreach_owner_delete"
on public.admin_outreach_accounts for delete to authenticated
using (public.is_admin() and auth.uid() = owner_user_id);

grant select, insert, update, delete on table public.admin_outreach_accounts to authenticated;

commit;
