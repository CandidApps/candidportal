-- Provider Rates dry-run catalog (public schema for PostgREST).
-- Data is loaded via scripts/load-earnings-dry-run.py + docs/earnings-import-dry-run/.
-- Live payouts remain gated (CR-0036).

begin;

create table if not exists public.earnings_dry_run_import_meta (
  key text primary key,
  value text not null
);

create table if not exists public.earnings_dry_run_providers (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  categories text[] not null default '{}',
  source_file text not null default 'Suppliers_Final.xlsx',
  created_at timestamptz not null default now()
);

create table if not exists public.earnings_dry_run_commission_products (
  id bigint generated always as identity primary key,
  sheet_row int not null default 0,
  provider_slug text not null references public.earnings_dry_run_providers (slug),
  category text,
  product_name text not null,
  gross_rate_pct numeric,
  intelisys_supported boolean,
  sandler_supported boolean,
  telarus_supported boolean,
  appdirect_supported boolean,
  appdirect_saas_supported boolean,
  candid_net_intelisys numeric,
  candid_net_sandler numeric,
  candid_net_telarus numeric,
  candid_net_appdirect_telco numeric,
  candid_net_appdirect_saas numeric,
  customer_preview_pct numeric,
  note text,
  renewal_scope text,
  pays_on_renewals boolean,
  payment_basis text,
  paid_on_basis text,
  evergreen_strength text,
  first_commission_timing text,
  upfront_summary text,
  exclusions_summary text,
  partner_network text,
  term_length text,
  partner_terms_raw jsonb not null default '{}'::jsonb,
  net_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.earnings_dry_run_commission_products
  add column if not exists net_overrides jsonb not null default '{}'::jsonb;

create index if not exists earnings_dry_run_products_provider_slug_idx
  on public.earnings_dry_run_commission_products (provider_slug);
create index if not exists earnings_dry_run_products_category_idx
  on public.earnings_dry_run_commission_products (category);

grant select, insert, update, delete on public.earnings_dry_run_import_meta to authenticated, service_role;
grant select, insert, update, delete on public.earnings_dry_run_providers to authenticated, service_role;
grant select, insert, update, delete on public.earnings_dry_run_commission_products to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

comment on table public.earnings_dry_run_providers is
  'Dry-run unique providers from Suppliers_Final Provider Rates sheet.';
comment on table public.earnings_dry_run_commission_products is
  'Dry-run commission product rate book; nets default from partner Candid share with net_overrides.';

commit;
