-- Client-facing flag on supplier contacts (from Candid_Supplier_Contacts.xlsx)

begin;

alter table public.solution_provider_contacts
  add column if not exists client_facing boolean not null default false;

commit;
