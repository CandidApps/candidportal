-- CRM: customers, locations, contacts, deals, customer_records + candid_documents storage

begin;

-- ── Admin helper ───────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ── Customers ──────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  company text not null,
  company_legal text,
  industry text,
  description text,
  website text,
  tax_id text,
  mcc_code text,
  corp_type text,
  notes text,
  status text not null default 'active'
    check (status in ('active', 'prospect', 'inactive')),
  agent text not null default 'Unassigned',
  spend numeric not null default 0,
  savings numeric not null default 0,
  contracts_count int not null default 0,
  files_count int not null default 0,
  since_label text,
  bmw_merchant_name text,
  portal_import_customer_id text,
  portal_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_external_id_key unique (external_id)
);

create index if not exists customers_company_idx on public.customers (lower(company));
create index if not exists customers_bmw_merchant_idx on public.customers (bmw_merchant_name)
  where bmw_merchant_name is not null;
create index if not exists customers_status_idx on public.customers (status);

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

-- ── Locations ──────────────────────────────────────────────────────────────
create table if not exists public.customer_locations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  external_id text not null,
  label text not null default 'Primary',
  street text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default '',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint customer_locations_customer_external_key unique (customer_id, external_id)
);

create index if not exists customer_locations_customer_idx on public.customer_locations (customer_id);

-- ── Contacts ─────────────────────────────────────────────────────────────────
create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  external_id text not null,
  name text not null,
  role text not null default '',
  email text not null default '',
  phone text not null default '',
  is_primary boolean not null default false,
  ownership_pct numeric,
  location_ids text[] not null default '{}',
  crm_notes text,
  portal_access boolean not null default false,
  portal_access_tier text,
  portal_invite_sent_at timestamptz,
  extra jsonb,
  created_at timestamptz not null default now(),
  constraint customer_contacts_customer_external_key unique (customer_id, external_id)
);

create index if not exists customer_contacts_customer_idx on public.customer_contacts (customer_id);

-- ── Deals / contracts ────────────────────────────────────────────────────────
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  external_id text not null,
  deal_uid text,
  deal_id text,
  pay_source text,
  provider text,
  product text,
  location_external_id text,
  deal_status text not null default 'active',
  monthly_cost numeric,
  contract_start_date date,
  contract_end_date date,
  contract_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_external_id_key unique (external_id)
);

create index if not exists deals_customer_idx on public.deals (customer_id);
create index if not exists deals_deal_uid_idx on public.deals (deal_uid) where deal_uid is not null;
create index if not exists deals_end_date_idx on public.deals (contract_end_date) where contract_end_date is not null;

drop trigger if exists set_deals_updated_at on public.deals;
create trigger set_deals_updated_at
before update on public.deals
for each row
execute function public.set_updated_at();

-- ── Documents / records ──────────────────────────────────────────────────────
create table if not exists public.customer_records (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  external_id text not null,
  location_external_id text,
  record_kind text not null,
  filename text not null,
  storage_path text,
  local_filename text,
  uploaded_by text,
  display_date text,
  file_size_label text,
  provider text,
  doc_subtype text,
  signed_date date,
  amount numeric,
  roi_note text,
  description text,
  onedrive_path text,
  visible_in_portal boolean not null default true,
  document_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_records_external_id_key unique (external_id)
);

create index if not exists customer_records_customer_idx on public.customer_records (customer_id);
create index if not exists customer_records_deal_idx on public.customer_records (deal_id);
create index if not exists customer_records_kind_idx on public.customer_records (record_kind);

drop trigger if exists set_customer_records_updated_at on public.customer_records;
create trigger set_customer_records_updated_at
before update on public.customer_records
for each row
execute function public.set_updated_at();

-- ── RLS: admin-only CRM tables ───────────────────────────────────────────────
alter table public.customers enable row level security;
alter table public.customer_locations enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.deals enable row level security;
alter table public.customer_records enable row level security;

drop policy if exists "customers_admin_all" on public.customers;
create policy "customers_admin_all"
on public.customers for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customer_locations_admin_all" on public.customer_locations;
create policy "customer_locations_admin_all"
on public.customer_locations for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customer_contacts_admin_all" on public.customer_contacts;
create policy "customer_contacts_admin_all"
on public.customer_contacts for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "deals_admin_all" on public.deals;
create policy "deals_admin_all"
on public.deals for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customer_records_admin_all" on public.customer_records;
create policy "customer_records_admin_all"
on public.customer_records for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.customers to authenticated;
grant select, insert, update, delete on table public.customer_locations to authenticated;
grant select, insert, update, delete on table public.customer_contacts to authenticated;
grant select, insert, update, delete on table public.deals to authenticated;
grant select, insert, update, delete on table public.customer_records to authenticated;

-- ── Storage: candid_documents (private) ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candid_documents',
  'candid_documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/csv'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "candid_documents_admin_select" on storage.objects;
create policy "candid_documents_admin_select"
on storage.objects for select to authenticated
using (bucket_id = 'candid_documents' and public.is_admin());

drop policy if exists "candid_documents_admin_insert" on storage.objects;
create policy "candid_documents_admin_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'candid_documents' and public.is_admin());

drop policy if exists "candid_documents_admin_update" on storage.objects;
create policy "candid_documents_admin_update"
on storage.objects for update to authenticated
using (bucket_id = 'candid_documents' and public.is_admin())
with check (bucket_id = 'candid_documents' and public.is_admin());

drop policy if exists "candid_documents_admin_delete" on storage.objects;
create policy "candid_documents_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'candid_documents' and public.is_admin());

commit;
