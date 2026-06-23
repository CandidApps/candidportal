-- Multiple named Our Rate templates per merchant services partner

begin;

create table if not exists public.solution_provider_rate_templates (
  id uuid primary key default gen_random_uuid(),
  provider_id bigint not null references public.solution_providers (id) on delete cascade,
  name text not null,
  rate_lines jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  imported_from_schedule_a_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists solution_provider_rate_templates_provider_idx
  on public.solution_provider_rate_templates (provider_id);

create unique index if not exists solution_provider_rate_templates_one_default
  on public.solution_provider_rate_templates (provider_id)
  where is_default = true;

drop trigger if exists set_solution_provider_rate_templates_updated_at on public.solution_provider_rate_templates;
create trigger set_solution_provider_rate_templates_updated_at
before update on public.solution_provider_rate_templates
for each row
execute function public.set_updated_at();

alter table public.solution_provider_rate_templates enable row level security;

drop policy if exists "solution_provider_rate_templates_admin_all" on public.solution_provider_rate_templates;
create policy "solution_provider_rate_templates_admin_all"
on public.solution_provider_rate_templates for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.solution_provider_rate_templates to authenticated;

-- Migrate legacy single our_rates row into a default template
insert into public.solution_provider_rate_templates (
  provider_id,
  name,
  rate_lines,
  is_default,
  imported_from_schedule_a_at,
  created_at,
  updated_at
)
select
  provider_id,
  'Default',
  rate_lines,
  true,
  imported_from_schedule_a_at,
  created_at,
  updated_at
from public.solution_provider_our_rates
where not exists (
  select 1
  from public.solution_provider_rate_templates t
  where t.provider_id = solution_provider_our_rates.provider_id
);

commit;
