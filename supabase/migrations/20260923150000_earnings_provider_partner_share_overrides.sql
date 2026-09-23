-- Per-supplier Candid share of gross overrides (e.g. Sandler 90% on Effortless / AireSpring).
-- Product nets = gross × effective share unless product net_overrides is set.

begin;

alter table public.earnings_dry_run_providers
  add column if not exists partner_share_overrides jsonb not null default '{}'::jsonb;

comment on column public.earnings_dry_run_providers.partner_share_overrides is
  'Partial map of partner key → Candid share of gross % for this supplier (overrides partner_suppliers.commission_rate).';

-- Architecture exceptions: Sandler 90% for Effortless Office and AireSpring (default 85%).
update public.earnings_dry_run_providers
set partner_share_overrides =
  coalesce(partner_share_overrides, '{}'::jsonb) || '{"sandler": 90}'::jsonb
where slug in ('effortless-office', 'airespring');

commit;
