-- Agent portal role + marketing hub read access for agents

begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'admin', 'agent'));

create or replace function public.is_agent()
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
      and p.role = 'agent'
  );
$$;

revoke all on function public.is_agent() from public;
grant execute on function public.is_agent() to authenticated;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.is_agent();
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

-- Agents: read marketing assets
drop policy if exists "marketing_assets_agent_select" on public.marketing_assets;
create policy "marketing_assets_agent_select"
on public.marketing_assets for select to authenticated
using (public.is_agent());

-- Agents: read marketing asset files from storage
drop policy if exists "marketing_assets_storage_agent_select" on storage.objects;
create policy "marketing_assets_storage_agent_select"
on storage.objects for select to authenticated
using (bucket_id = 'marketing-assets' and public.is_agent());

-- Track PDF → email template lineage
alter table public.marketing_assets
  add column if not exists source_asset_id uuid references public.marketing_assets (id) on delete set null;

create index if not exists marketing_assets_source_asset_idx
  on public.marketing_assets (source_asset_id)
  where source_asset_id is not null;

commit;
