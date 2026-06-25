-- UCaaS quoting catalogs (per provider) + ensure a Vonage UCaaS provider exists.
-- The catalog JSON (products, fees, tax config) is stored in jsonb and auto-seeded
-- in application code from BUILTIN_UCAAS_CATALOGS on first use.

begin;

create table if not exists public.solution_provider_ucaas_catalogs (
  id uuid primary key default gen_random_uuid(),
  provider_id bigint not null references public.solution_providers (id) on delete cascade,
  name text not null,
  catalog jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists solution_provider_ucaas_catalogs_provider_idx
  on public.solution_provider_ucaas_catalogs (provider_id);

create unique index if not exists solution_provider_ucaas_catalogs_one_default
  on public.solution_provider_ucaas_catalogs (provider_id)
  where is_default = true;

drop trigger if exists set_solution_provider_ucaas_catalogs_updated_at on public.solution_provider_ucaas_catalogs;
create trigger set_solution_provider_ucaas_catalogs_updated_at
before update on public.solution_provider_ucaas_catalogs
for each row
execute function public.set_updated_at();

alter table public.solution_provider_ucaas_catalogs enable row level security;

drop policy if exists "solution_provider_ucaas_catalogs_admin_all" on public.solution_provider_ucaas_catalogs;
create policy "solution_provider_ucaas_catalogs_admin_all"
on public.solution_provider_ucaas_catalogs for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.solution_provider_ucaas_catalogs to authenticated, service_role;

-- Ensure a Vonage UCaaS provider exists and is flagged for analysis rate tooling.
insert into public.solution_providers (slug, name, display_name, provider_category, include_rates_in_analysis)
select 'vonage', 'Vonage', 'Vonage', 'ucaas', true
where not exists (
  select 1 from public.solution_providers where lower(slug) = 'vonage' or lower(name) = 'vonage'
);

update public.solution_providers
set provider_category = coalesce(provider_category, 'ucaas'),
    include_rates_in_analysis = true
where lower(slug) = 'vonage' or lower(name) = 'vonage';

commit;
