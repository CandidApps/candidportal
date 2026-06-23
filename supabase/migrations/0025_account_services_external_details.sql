-- Member-tracked external service details (not with Candid)

begin;

alter table public.account_services
  add column if not exists service_description text,
  add column if not exists user_count integer,
  add column if not exists renewal_terms text,
  add column if not exists interested_in_alternatives boolean not null default false,
  add column if not exists contract_start_date date,
  add column if not exists contract_storage_path text,
  add column if not exists contract_filename text;

commit;
