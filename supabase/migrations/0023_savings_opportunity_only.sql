-- Savings opportunity uploads stay on My Savings Opportunities until the member adds them to My Services.

begin;

alter table public.account_services
  add column if not exists savings_opportunity_only boolean not null default false;

-- Existing member bill uploads were already listed under My Services.
update public.account_services
set savings_opportunity_only = false
where bill_storage_path is not null;

commit;
