-- Provider categories + merchant Schedule A rate storage

begin;

alter table public.solution_providers
  add column if not exists provider_category text;

alter table public.partner_suppliers
  add column if not exists provider_category text;

create table if not exists public.solution_provider_schedule_a (
  id uuid primary key default gen_random_uuid(),
  provider_id bigint not null references public.solution_providers (id) on delete cascade,
  document_id uuid,
  filename text,
  storage_path text,
  rate_lines jsonb not null default '[]'::jsonb,
  parsed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solution_provider_schedule_a_provider_key unique (provider_id)
);

create index if not exists solution_provider_schedule_a_provider_idx
  on public.solution_provider_schedule_a (provider_id);

drop trigger if exists set_solution_provider_schedule_a_updated_at on public.solution_provider_schedule_a;
create trigger set_solution_provider_schedule_a_updated_at
before update on public.solution_provider_schedule_a
for each row
execute function public.set_updated_at();

alter table public.solution_provider_schedule_a enable row level security;

drop policy if exists "solution_provider_schedule_a_admin_all" on public.solution_provider_schedule_a;
create policy "solution_provider_schedule_a_admin_all"
on public.solution_provider_schedule_a for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.solution_provider_schedule_a to authenticated;

commit;
