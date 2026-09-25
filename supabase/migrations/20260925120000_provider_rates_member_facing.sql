-- CR-0048: Member-facing Provider Rates labels, visibility flags, supplier merge support.
-- Live payouts remain gated; this is the dry-run catalog only.

begin;

alter table public.earnings_dry_run_providers
  add column if not exists customer_facing boolean not null default true,
  add column if not exists merged_into_slug text null,
  add column if not exists member_name text null;

alter table public.earnings_dry_run_providers
  drop constraint if exists earnings_dry_run_providers_merged_into_slug_fkey;

alter table public.earnings_dry_run_providers
  add constraint earnings_dry_run_providers_merged_into_slug_fkey
  foreign key (merged_into_slug) references public.earnings_dry_run_providers (slug);

comment on column public.earnings_dry_run_providers.customer_facing is
  'When false, supplier is hidden from member-facing Provider Rates views.';
comment on column public.earnings_dry_run_providers.merged_into_slug is
  'Canonical supplier slug when this row was merged as a duplicate partner-database label.';
comment on column public.earnings_dry_run_providers.member_name is
  'Optional member-facing display name; falls back to name.';

alter table public.earnings_dry_run_commission_products
  add column if not exists source_product_name text null,
  add column if not exists hide_from_member_view boolean not null default false;

comment on column public.earnings_dry_run_commission_products.source_product_name is
  'Original partner-ratebook product label before member-facing rewrite.';
comment on column public.earnings_dry_run_commission_products.hide_from_member_view is
  'Admin checkbox: hide this product from member-facing catalogs.';

-- Preserve originals once (idempotent).
update public.earnings_dry_run_commission_products
set source_product_name = product_name
where source_product_name is null;

commit;
