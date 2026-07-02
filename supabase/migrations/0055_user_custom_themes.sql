-- Per-account portal theme preferences and custom theme definitions.

begin;

alter table public.profiles
  add column if not exists theme_preset_id text,
  add column if not exists theme_color_scheme text check (theme_color_scheme in ('light', 'dark'));

comment on column public.profiles.theme_preset_id is
  'Active theme preset id (built-in or custom-{uuid}).';
comment on column public.profiles.theme_color_scheme is
  'User light/dark color scheme preference.';

create table if not exists public.user_custom_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 48),
  colors text[] not null check (array_length(colors, 1) = 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_custom_themes_user_idx
  on public.user_custom_themes (user_id, updated_at desc);

drop trigger if exists set_user_custom_themes_updated_at on public.user_custom_themes;
create trigger set_user_custom_themes_updated_at
before update on public.user_custom_themes
for each row execute function public.set_updated_at();

alter table public.user_custom_themes enable row level security;

drop policy if exists "user_custom_themes_own" on public.user_custom_themes;
create policy "user_custom_themes_own"
on public.user_custom_themes for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on table public.user_custom_themes to authenticated;

commit;
