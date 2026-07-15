-- Per-admin sidebar order + visibility preferences

begin;

create table if not exists public.admin_sidebar_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  "order" text[] not null default '{}',
  hidden text[] not null default '{}',
  updated_at timestamptz not null default now()
);

drop trigger if exists set_admin_sidebar_preferences_updated_at on public.admin_sidebar_preferences;
create trigger set_admin_sidebar_preferences_updated_at
before update on public.admin_sidebar_preferences
for each row
execute function public.set_updated_at();

alter table public.admin_sidebar_preferences enable row level security;

drop policy if exists "admin_sidebar_prefs_owner_all" on public.admin_sidebar_preferences;
create policy "admin_sidebar_prefs_owner_all"
on public.admin_sidebar_preferences for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.admin_sidebar_preferences to authenticated;

commit;
