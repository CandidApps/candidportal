-- DRY RUN ONLY — do not apply to production.
-- Generated from Suppliers_Final.xlsx / Provider Rates
-- Schema lives in earnings_dry_run so it cannot collide with live tables.

begin;

create schema if not exists earnings_dry_run;

drop table if exists earnings_dry_run.commission_products cascade;
drop table if exists earnings_dry_run.providers cascade;
drop table if exists earnings_dry_run.import_meta cascade;

create table earnings_dry_run.import_meta (
  key text primary key,
  value text not null
);

create table earnings_dry_run.providers (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  categories text[] not null default '{}',
  source_file text not null default 'Suppliers_Final.xlsx',
  created_at timestamptz not null default now()
);

comment on table earnings_dry_run.providers is
  'Unique Provider names from Provider Rates (suppliers/vendors). Match to public.solution_providers.slug later.';

create table earnings_dry_run.commission_products (
  id bigint generated always as identity primary key,
  sheet_row int not null,
  provider_slug text not null references earnings_dry_run.providers(slug),
  category text,
  product_name text not null,
  gross_rate_pct numeric,

  -- portfolio (Supported?)
  intelisys_supported boolean,
  sandler_supported boolean,
  telarus_supported boolean,
  appdirect_supported boolean,
  appdirect_saas_supported boolean,

  -- sheet precomputed candid nets + column O preview
  candid_net_intelisys numeric,
  candid_net_sandler numeric,
  candid_net_telarus numeric,
  candid_net_appdirect_telco numeric,
  candid_net_appdirect_saas numeric,
  customer_preview_pct numeric,
  note text,

  -- CONSOLIDATED commission terms (from cols Q–AC overlap)
  renewal_scope text,           -- initial_term_only | initial_and_renewal | renewals_at_standard_rate | renewals_special_rate | no_renewal_pay | new_logo_and_follow_on | renewals_see_notes
  pays_on_renewals boolean,     -- derived when clear from Sandler renewals / Note
  payment_basis text,           -- collected | billed | other  (Sandler method ∪ Intelisys payment language)
  paid_on_basis text,           -- overall_mrc | loop_and_port | port_only | one_time_* | install | … (Telarus Paid On ∪ Sandler upfront presence)
  evergreen_strength text,      -- strong | medium | with_risk | none | other (Sandler taxonomy; useful even when other partners silent)
  first_commission_timing text, -- Sandler timing (best lag signal in sheet)
  upfront_summary text,         -- Sandler upfront raw (NRC / SOW schedules)
  exclusions_summary text,      -- Intelisys "not paid on" (taxes, loops, hardware, …)
  partner_network text,         -- Telarus Network / SKU path label
  term_length text,             -- Telarus Term (All, 2 Year, …)

  -- audit: original partner-labeled columns kept as jsonb (AppDirect has none in this workbook)
  partner_terms_raw jsonb not null default '{}'::jsonb,
  -- explicit net % overrides when a partner gave a special supplier split
  net_overrides jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index on earnings_dry_run.commission_products (provider_slug);
create index on earnings_dry_run.commission_products (category);
create index on earnings_dry_run.commission_products (payment_basis);
create index on earnings_dry_run.commission_products (paid_on_basis);
create index on earnings_dry_run.commission_products (renewal_scope);

comment on column earnings_dry_run.commission_products.partner_terms_raw is
  'Raw Sandler/Telarus/Intelisys term blobs for audit. AppDirect had no Q+ columns in Suppliers_Final.xlsx.';

insert into earnings_dry_run.import_meta(key, value) values
  ('source_file', 'Suppliers_Final.xlsx'),
  ('source_sheet', 'Provider Rates'),
  ('generated_for', 'CR-0035 / CR-0036 / CR-0001 dry-run — local only');

commit;
