-- Per-deal house split overrides (partner pool + employee cuts).

begin;

create table if not exists public.internal_deal_splits (
  deal_uid text primary key,
  label text,
  partner_splits jsonb not null default '[]'::jsonb,
  employee_splits jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.internal_deal_splits enable row level security;

drop policy if exists "internal_deal_splits_admin_all" on public.internal_deal_splits;
create policy "internal_deal_splits_admin_all"
on public.internal_deal_splits for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.internal_deal_splits to authenticated;

commit;
