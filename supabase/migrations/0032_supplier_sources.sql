-- Supplier reference sources: titled links with a free-form, reusable type.
-- Used across the app and as references for the AI assistant.

begin;

create table if not exists public.solution_provider_sources (
  id bigint generated always as identity primary key,
  provider_id bigint not null references public.solution_providers (id) on delete cascade,
  title text not null,
  url text not null default '',
  source_type text not null default 'Reference',
  visible_in_portal boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists solution_provider_sources_provider_idx
  on public.solution_provider_sources (provider_id);

create index if not exists solution_provider_sources_type_idx
  on public.solution_provider_sources (source_type);

create index if not exists solution_provider_sources_portal_idx
  on public.solution_provider_sources (provider_id, visible_in_portal)
  where visible_in_portal = true;

drop trigger if exists set_solution_provider_sources_updated_at on public.solution_provider_sources;
create trigger set_solution_provider_sources_updated_at
before update on public.solution_provider_sources
for each row
execute function public.set_updated_at();

alter table public.solution_provider_sources enable row level security;

drop policy if exists "anon_all" on public.solution_provider_sources;
create policy "anon_all"
on public.solution_provider_sources for all to anon using (true) with check (true);

grant select, insert, update, delete on table public.solution_provider_sources to anon, authenticated, service_role;

commit;
