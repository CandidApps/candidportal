-- Brand family for logo/branding assets (Candid, CandidPay, CandidIQ)

begin;

alter table public.marketing_assets
  add column if not exists brand text
  check (brand is null or brand in ('candid', 'candid_pay', 'candid_iq'));

create index if not exists marketing_assets_brand_idx
  on public.marketing_assets (brand)
  where brand is not null;

commit;
