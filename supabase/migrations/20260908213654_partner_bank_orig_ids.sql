-- Multiple Chase ORIG IDs per commission partner (CR-0005).

begin;

alter table public.partner_suppliers
  add column if not exists bank_orig_ids text[] not null default '{}';

-- Backfill from the legacy single bank_orig_id column.
update public.partner_suppliers
set bank_orig_ids = array[bank_orig_id]
where bank_orig_id is not null
  and trim(bank_orig_id) <> ''
  and (bank_orig_ids is null or cardinality(bank_orig_ids) = 0);

create index if not exists partner_suppliers_orig_ids_gin_idx
  on public.partner_suppliers using gin (bank_orig_ids);

comment on column public.partner_suppliers.bank_orig_ids is
  'Chase ORIG IDs used to match bank deposit uploads to this partner. bank_orig_id remains the primary/first ID for compatibility.';

commit;
