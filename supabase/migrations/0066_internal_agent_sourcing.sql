-- Per-agent-chain house split overrides (e.g. Joe sourced Agent A → 60/40 on those deals).

begin;

create table if not exists public.internal_agent_sourcing (
  agent_merge_key text primary key,
  label text,
  sourced_by_profile_id uuid references public.profiles (id) on delete set null,
  partner_splits jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.internal_agent_sourcing enable row level security;

drop policy if exists "internal_agent_sourcing_admin_all" on public.internal_agent_sourcing;
create policy "internal_agent_sourcing_admin_all"
on public.internal_agent_sourcing for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.internal_agent_sourcing to authenticated;

commit;
