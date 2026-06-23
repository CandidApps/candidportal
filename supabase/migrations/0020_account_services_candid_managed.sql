-- Distinguish Candid-managed services from member-uploaded external vendor bills

begin;

alter table public.account_services
  add column if not exists candid_managed boolean not null default true;

-- Bill uploads from the member portal are external (not Candid-managed)
update public.account_services
set candid_managed = false
where bill_storage_path is not null;

drop policy if exists "account_services_insert_own" on public.account_services;
create policy "account_services_insert_own"
on public.account_services
for insert
to authenticated
with check (user_id = auth.uid() and candid_managed = false);

drop policy if exists "account_services_delete_own" on public.account_services;
create policy "account_services_delete_own"
on public.account_services
for delete
to authenticated
using (user_id = auth.uid() and candid_managed = false);

commit;
