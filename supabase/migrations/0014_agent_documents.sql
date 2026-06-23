-- Agent documents (agency agreements, addenda, W-9, etc.)

begin;

create table if not exists public.agent_documents (
  id uuid primary key default gen_random_uuid(),
  agent_merge_key text not null,
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

create index if not exists agent_documents_merge_key_idx
  on public.agent_documents (agent_merge_key);

drop trigger if exists set_agent_documents_updated_at on public.agent_documents;
create trigger set_agent_documents_updated_at
before update on public.agent_documents
for each row
execute function public.set_updated_at();

alter table public.agent_documents enable row level security;

drop policy if exists "agent_documents_admin_all" on public.agent_documents;
create policy "agent_documents_admin_all"
on public.agent_documents for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.agent_documents to authenticated;

commit;
