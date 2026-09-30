-- CR-0035: supplier SPIFF spreadsheet import. Original supplier fields are stored admin-only;
-- members only see title / details / criteria and a reward computed from structure_type/value.

alter table public.incentive_campaigns
  add column if not exists criteria text,
  add column if not exists source_program text,
  add column if not exists category text,
  add column if not exists internal_name text,
  add column if not exists internal_description text,
  add column if not exists internal_terms text,
  add column if not exists admin_notes text,
  add column if not exists payout_raw text,
  add column if not exists payout_up_to boolean not null default false,
  add column if not exists min_monthly_charge numeric,
  add column if not exists min_term_months integer,
  add column if not exists payout_timeline text,
  add column if not exists external_link text,
  add column if not exists import_key text,
  add column if not exists imported_at timestamptz;

create unique index if not exists incentive_campaigns_import_key_uidx
  on public.incentive_campaigns (provider_id, import_key)
  where import_key is not null;

comment on column public.incentive_campaigns.criteria is 'Customer-facing qualifying conditions.';
comment on column public.incentive_campaigns.internal_description is 'Admin only: supplier SPIFF text as written for the channel.';
comment on column public.incentive_campaigns.payout_raw is 'Admin only: supplier payout as stated, e.g. "8X MRC (up to)". Member reward = structure value x member tier share.';
comment on column public.incentive_campaigns.import_key is 'Stable key from supplier + program + name/description + payout + expiration; re-imports update instead of duplicating.';
