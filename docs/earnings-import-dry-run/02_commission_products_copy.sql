-- DRY RUN ONLY — load commission products via COPY
-- From repo root, against a local/dev DB (NOT production):
--   psql "$DATABASE_URL" -f docs/earnings-import-dry-run/00_schema.sql
--   psql "$DATABASE_URL" -f docs/earnings-import-dry-run/01_providers.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/earnings-import-dry-run/02_commission_products_copy.sql

begin;

\copy earnings_dry_run.commission_products (
  sheet_row, provider_slug, category, product_name, gross_rate_pct,
  intelisys_supported, sandler_supported, telarus_supported, appdirect_supported, appdirect_saas_supported,
  candid_net_intelisys, candid_net_sandler, candid_net_telarus, candid_net_appdirect_telco, candid_net_appdirect_saas,
  customer_preview_pct, note,
  renewal_scope, pays_on_renewals, payment_basis, paid_on_basis, evergreen_strength,
  first_commission_timing, upfront_summary, exclusions_summary, partner_network, term_length,
  partner_terms_raw
) from 'docs/earnings-import-dry-run/02_commission_products.csv' with (format csv, header true, null '');

insert into earnings_dry_run.import_meta(key, value) values
  ('provider_count', (select count(*)::text from earnings_dry_run.providers)),
  ('product_count', (select count(*)::text from earnings_dry_run.commission_products))
on conflict (key) do update set value = excluded.value;

commit;
