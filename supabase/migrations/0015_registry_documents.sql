-- Documents for commission partners and solution providers (suppliers/vendors)

begin;

create table if not exists public.registry_documents (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('commission_partner', 'solution_provider')),
  entity_key text not null,
  document_type text not null,
  filename text not null,
  storage_path text not null,
  uploaded_by text not null default '',
  signed_date date,
  notes text,
  file_size_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists registry_documents_entity_idx
  on public.registry_documents (entity_type, entity_key);

drop trigger if exists set_registry_documents_updated_at on public.registry_documents;
create trigger set_registry_documents_updated_at
before update on public.registry_documents
for each row
execute function public.set_updated_at();

alter table public.registry_documents enable row level security;

drop policy if exists "registry_documents_admin_all" on public.registry_documents;
create policy "registry_documents_admin_all"
on public.registry_documents for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.registry_documents to authenticated;

commit;
