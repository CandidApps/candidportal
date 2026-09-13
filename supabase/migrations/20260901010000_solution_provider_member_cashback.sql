-- Member-facing cash back % on Find Solutions (CR-0001 phase 1).
-- Separate from partner residual rates (commission house economics).

alter table public.solution_providers
  add column if not exists member_cashback_pct numeric(6, 2);

comment on column public.solution_providers.member_cashback_pct is
  'Customer cash-back percent shown on Find Solutions (Rakuten-style). Null = hide.';
