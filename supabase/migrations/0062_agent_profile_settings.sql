-- Agent profile overrides (status, inactive date, contact info) keyed by merge key.

begin;

create table if not exists public.agent_profile_settings (
  merge_key text primary key,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.agent_profile_settings enable row level security;

drop policy if exists "agent_profile_settings_admin_all" on public.agent_profile_settings;
create policy "agent_profile_settings_admin_all"
on public.agent_profile_settings for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.agent_profile_settings to authenticated;

commit;
