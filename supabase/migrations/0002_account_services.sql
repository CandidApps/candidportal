-- Account services: user-managed technology services and bill uploads

begin;

create table if not exists public.account_services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  vendor text,
  status text not null default 'pending_analysis'
    check (status in ('pending_analysis', 'active', 'expiring', 'external')),
  monthly_amount_cents integer,
  expires_at date,
  logo_key text not null default 'msp',
  bill_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_services_user_id_idx
  on public.account_services (user_id);

create index if not exists account_services_status_idx
  on public.account_services (status);

drop trigger if exists set_account_services_updated_at on public.account_services;
create trigger set_account_services_updated_at
before update on public.account_services
for each row
execute function public.set_updated_at();

alter table public.account_services enable row level security;

drop policy if exists "account_services_select_own" on public.account_services;
create policy "account_services_select_own"
on public.account_services
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "account_services_insert_own" on public.account_services;
create policy "account_services_insert_own"
on public.account_services
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "account_services_update_own" on public.account_services;
create policy "account_services_update_own"
on public.account_services
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "account_services_delete_own" on public.account_services;
create policy "account_services_delete_own"
on public.account_services
for delete
to authenticated
using (user_id = auth.uid());

-- Storage bucket for uploaded bills
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-bills',
  'service-bills',
  false,
  52428800,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do nothing;

drop policy if exists "service_bills_select_own" on storage.objects;
create policy "service_bills_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'service-bills'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "service_bills_insert_own" on storage.objects;
create policy "service_bills_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'service-bills'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "service_bills_update_own" on storage.objects;
create policy "service_bills_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'service-bills'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'service-bills'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "service_bills_delete_own" on storage.objects;
create policy "service_bills_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'service-bills'
  and (storage.foldername(name))[1] = auth.uid()::text
);

grant select, insert, update, delete on table public.account_services to authenticated;

commit;
