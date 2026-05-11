/*
  Run this in Supabase Dashboard -> SQL Editor.

  This sets up:
  - profiles table (one row per auth user)
  - role column (user/admin)
  - trigger to auto-create profiles on signup
  - RLS policies (self access + admin access)

  NOTE (Supabase breaking change 2026-04-28):
  New tables may not be exposed to the Data API automatically.
  If your project requires it, you may need to enable exposure in the Dashboard
  and/or run explicit GRANTs (see bottom).
*/

begin;

-- 1) profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- Keep updated_at current
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- 2) Create a profile automatically on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Ensure only the auth system can call the function via trigger
revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 3) RLS
alter table public.profiles enable row level security;

-- Self can read own profile
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- Self can update own profile but cannot change role
drop policy if exists "profiles_update_own_no_role_change" on public.profiles;
create policy "profiles_update_own_no_role_change"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- Admin can read all profiles
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

-- Admin can update any profile (including role)
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (true);

-- 4) Optional GRANTs (only needed if your Data API exposure requires it)
-- grant usage on schema public to authenticated;
-- grant select, insert, update, delete on table public.profiles to authenticated;

commit;

