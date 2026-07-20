-- Fix profiles RLS recursion + align is_admin() with app admin email rule.
-- Team profiles were often role='user' while the app treats @candid.solutions as admin,
-- so getMyRole email fallback worked on some paths while RLS/is_admin() still failed.

begin;

-- Prefer security-definer helper (no recursive profiles self-select).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or lower(split_part(coalesce(p.email, ''), '@', 2)) = 'candid.solutions'
      )
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Drop recursive EXISTS(select from profiles…) policies; use is_admin() instead.
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
on public.profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (true);

-- Self-update policy also re-entered profiles via subquery; use security-definer helper.
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.current_profile_role() from public;
grant execute on function public.current_profile_role() to authenticated;

drop policy if exists "profiles_update_own_no_role_change" on public.profiles;
create policy "profiles_update_own_no_role_change"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = public.current_profile_role());

-- Align stored roles with who the app already treats as admin.
update public.profiles
set role = 'admin'
where role is distinct from 'admin'
  and (
    role = 'user'
    or role is null
  )
  and lower(split_part(coalesce(email, ''), '@', 2)) = 'candid.solutions';

commit;
