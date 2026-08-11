-- Persist verify amounts for deposit-only commission sources (Candid, TekSystems,
-- CorpIT, Linked2Pay, etc.) so they survive cache clear / logout, and can be
-- carried forward into the next month when a deposit posts with no uploaded report.

begin;

create table if not exists public.verified_pay_source_commissions (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  source_label text not null,
  period text not null,
  deposit_amount numeric(14, 2) not null default 0,
  lines jsonb not null default '[]'::jsonb,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verified_pay_source_commissions_source_period_key unique (source_key, period),
  constraint verified_pay_source_commissions_period_format check (period ~ '^\d{4}-\d{2}$')
);

create index if not exists verified_pay_source_commissions_period_idx
  on public.verified_pay_source_commissions (period desc);

alter table public.verified_pay_source_commissions enable row level security;

drop policy if exists "verified_pay_source_commissions_admin_all" on public.verified_pay_source_commissions;
create policy "verified_pay_source_commissions_admin_all"
on public.verified_pay_source_commissions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

revoke all on public.verified_pay_source_commissions from anon;

commit;
