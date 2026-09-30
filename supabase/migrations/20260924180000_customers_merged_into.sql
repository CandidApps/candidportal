alter table public.customers
  add column if not exists merged_into_external_id text;

create index if not exists customers_merged_into_external_id_idx
  on public.customers (merged_into_external_id)
  where merged_into_external_id is not null;

comment on column public.customers.merged_into_external_id is
  'When this account was merged away, the surviving customers.external_id.';
