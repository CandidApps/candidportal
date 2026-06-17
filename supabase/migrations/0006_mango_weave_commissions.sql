-- Mango and Weave commission tables

begin;

create table if not exists public.mango_commissions (
  id bigint generated always as identity primary key,
  period text not null,
  customer text,
  activation_date text,
  account_num text not null,
  annual text,
  seats numeric,
  rate numeric,
  other numeric,
  mrc numeric,
  commission_rate numeric,
  commission numeric not null default 0,
  commission_month text,
  created_at timestamptz not null default now(),
  unique (period, account_num)
);

create index if not exists mango_commissions_period_idx
  on public.mango_commissions (period);

create table if not exists public.weave_commissions (
  id bigint generated always as identity primary key,
  period text not null,
  partner_object_name text not null,
  payout numeric not null default 0,
  commission_month text,
  created_at timestamptz not null default now(),
  unique (period, partner_object_name)
);

create index if not exists weave_commissions_period_idx
  on public.weave_commissions (period);

alter table public.mango_commissions enable row level security;
alter table public.weave_commissions enable row level security;

drop policy if exists "anon_all" on public.mango_commissions;
create policy "anon_all"
on public.mango_commissions
for all
to anon
using (true)
with check (true);

drop policy if exists "anon_all" on public.weave_commissions;
create policy "anon_all"
on public.weave_commissions
for all
to anon
using (true)
with check (true);

grant select, insert, update, delete on table public.mango_commissions to anon, authenticated, service_role;
grant select, insert, update, delete on table public.weave_commissions to anon, authenticated, service_role;

commit;
