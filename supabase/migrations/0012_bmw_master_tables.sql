-- BMW deal master + agent commission rates (replaces local deals.json / agent-rates.json)

begin;

create table if not exists public.bmw_deals (
  id bigint generated always as identity primary key,
  external_key text not null,
  deal_uid text,
  merchant text,
  pay_source text,
  agent_comm_id text,
  deal_data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint bmw_deals_external_key_key unique (external_key)
);

create index if not exists bmw_deals_deal_uid_idx on public.bmw_deals (deal_uid) where deal_uid is not null;
create index if not exists bmw_deals_merchant_idx on public.bmw_deals (lower(merchant));
create index if not exists bmw_deals_pay_source_idx on public.bmw_deals (pay_source);

create table if not exists public.bmw_agent_rates (
  id bigint generated always as identity primary key,
  agent_comm_id text not null,
  rate_data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint bmw_agent_rates_agent_comm_id_key unique (agent_comm_id)
);

alter table public.bmw_deals enable row level security;
alter table public.bmw_agent_rates enable row level security;

drop policy if exists "bmw_deals_admin_all" on public.bmw_deals;
create policy "bmw_deals_admin_all"
on public.bmw_deals for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "bmw_agent_rates_admin_all" on public.bmw_agent_rates;
create policy "bmw_agent_rates_admin_all"
on public.bmw_agent_rates for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.bmw_deals to authenticated;
grant select, insert, update, delete on table public.bmw_agent_rates to authenticated;

commit;
