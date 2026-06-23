-- Include supplier rates in customer analysis + Candid "our rate" schedule

begin;

alter table public.solution_providers
  add column if not exists include_rates_in_analysis boolean not null default false;

create table if not exists public.solution_provider_our_rates (
  id uuid primary key default gen_random_uuid(),
  provider_id bigint not null references public.solution_providers (id) on delete cascade,
  rate_lines jsonb not null default '[]'::jsonb,
  imported_from_schedule_a_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solution_provider_our_rates_provider_key unique (provider_id)
);

create index if not exists solution_provider_our_rates_provider_idx
  on public.solution_provider_our_rates (provider_id);

drop trigger if exists set_solution_provider_our_rates_updated_at on public.solution_provider_our_rates;
create trigger set_solution_provider_our_rates_updated_at
before update on public.solution_provider_our_rates
for each row
execute function public.set_updated_at();

alter table public.solution_provider_our_rates enable row level security;

drop policy if exists "solution_provider_our_rates_admin_all" on public.solution_provider_our_rates;
create policy "solution_provider_our_rates_admin_all"
on public.solution_provider_our_rates for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.solution_provider_our_rates to authenticated;

commit;
