-- Supplier / vendor guides and documentation

begin;

create table if not exists public.solution_provider_guides (
  id bigint generated always as identity primary key,
  provider_id bigint not null references public.solution_providers (id) on delete cascade,
  title text not null,
  content text not null default '',
  category text not null default 'guide'
    check (category in ('guide', 'documentation', 'faq', 'process')),
  visible_in_portal boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists solution_provider_guides_provider_idx
  on public.solution_provider_guides (provider_id);

create index if not exists solution_provider_guides_portal_idx
  on public.solution_provider_guides (provider_id, visible_in_portal)
  where visible_in_portal = true;

drop trigger if exists set_solution_provider_guides_updated_at on public.solution_provider_guides;
create trigger set_solution_provider_guides_updated_at
before update on public.solution_provider_guides
for each row
execute function public.set_updated_at();

alter table public.solution_provider_guides enable row level security;

drop policy if exists "anon_all" on public.solution_provider_guides;
create policy "anon_all"
on public.solution_provider_guides for all to anon using (true) with check (true);

grant select, insert, update, delete on table public.solution_provider_guides to anon, authenticated, service_role;

commit;
