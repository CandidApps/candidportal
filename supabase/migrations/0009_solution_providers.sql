-- Solution providers (vendors), contacts, solutions, and per-partner commission rates

begin;

create table if not exists public.solution_providers (
  id bigint generated always as identity primary key,
  slug text not null,
  name text not null,
  display_name text,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists solution_providers_slug_key
  on public.solution_providers (lower(slug));

create unique index if not exists solution_providers_name_key
  on public.solution_providers (lower(name));

create table if not exists public.solution_provider_contacts (
  id bigint generated always as identity primary key,
  provider_id bigint not null references public.solution_providers (id) on delete cascade,
  name text not null,
  role text not null default '',
  email text not null default '',
  phone text not null default '',
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists solution_provider_contacts_provider_idx
  on public.solution_provider_contacts (provider_id);

create table if not exists public.solution_provider_solutions (
  id bigint generated always as identity primary key,
  provider_id bigint not null references public.solution_providers (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists solution_provider_solutions_provider_idx
  on public.solution_provider_solutions (provider_id);

create table if not exists public.solution_provider_solution_rates (
  id bigint generated always as identity primary key,
  solution_id bigint not null references public.solution_provider_solutions (id) on delete cascade,
  pay_source text not null,
  rate_pct numeric not null,
  created_at timestamptz not null default now(),
  unique (solution_id, pay_source)
);

create index if not exists solution_provider_solution_rates_solution_idx
  on public.solution_provider_solution_rates (solution_id);

alter table public.solution_providers enable row level security;
alter table public.solution_provider_contacts enable row level security;
alter table public.solution_provider_solutions enable row level security;
alter table public.solution_provider_solution_rates enable row level security;

drop policy if exists "anon_all" on public.solution_providers;
create policy "anon_all"
on public.solution_providers for all to anon using (true) with check (true);

drop policy if exists "anon_all" on public.solution_provider_contacts;
create policy "anon_all"
on public.solution_provider_contacts for all to anon using (true) with check (true);

drop policy if exists "anon_all" on public.solution_provider_solutions;
create policy "anon_all"
on public.solution_provider_solutions for all to anon using (true) with check (true);

drop policy if exists "anon_all" on public.solution_provider_solution_rates;
create policy "anon_all"
on public.solution_provider_solution_rates for all to anon using (true) with check (true);

grant select, insert, update, delete on table public.solution_providers to anon, authenticated, service_role;
grant select, insert, update, delete on table public.solution_provider_contacts to anon, authenticated, service_role;
grant select, insert, update, delete on table public.solution_provider_solutions to anon, authenticated, service_role;
grant select, insert, update, delete on table public.solution_provider_solution_rates to anon, authenticated, service_role;

commit;
