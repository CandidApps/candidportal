-- Outreach tags: reusable tag entities + many-to-many account links

begin;

create table if not exists public.admin_outreach_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_normalized text not null,
  created_by uuid references auth.users (id) on delete set null,
  -- Optional batch planning date for everyone working this tag group
  batch_follow_up_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name_normalized)
);

create index if not exists admin_outreach_tags_name_idx
  on public.admin_outreach_tags (name_normalized);

drop trigger if exists set_admin_outreach_tags_updated_at on public.admin_outreach_tags;
create trigger set_admin_outreach_tags_updated_at
before update on public.admin_outreach_tags
for each row
execute function public.set_updated_at();

create table if not exists public.admin_outreach_account_tags (
  outreach_account_id uuid not null
    references public.admin_outreach_accounts (id) on delete cascade,
  tag_id uuid not null
    references public.admin_outreach_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (outreach_account_id, tag_id)
);

create index if not exists admin_outreach_account_tags_tag_idx
  on public.admin_outreach_account_tags (tag_id);

create index if not exists admin_outreach_account_tags_account_idx
  on public.admin_outreach_account_tags (outreach_account_id);

alter table public.admin_outreach_tags enable row level security;
alter table public.admin_outreach_account_tags enable row level security;

drop policy if exists "admin_outreach_tags_admin_all" on public.admin_outreach_tags;
create policy "admin_outreach_tags_admin_all"
on public.admin_outreach_tags for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin_outreach_account_tags_admin_all" on public.admin_outreach_account_tags;
create policy "admin_outreach_account_tags_admin_all"
on public.admin_outreach_account_tags for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on table public.admin_outreach_tags to authenticated;
grant select, insert, update, delete on table public.admin_outreach_account_tags to authenticated;

commit;
