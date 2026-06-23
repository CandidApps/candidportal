-- Admin action claiming, assignment, and team notes with @mentions

begin;

create table if not exists public.admin_action_work (
  action_key text primary key,
  action_kind text not null,
  source_id text not null,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_action_work_kind_idx on public.admin_action_work (action_kind);
create index if not exists admin_action_work_claimed_by_idx on public.admin_action_work (claimed_by);

create table if not exists public.admin_action_assignees (
  action_key text not null references public.admin_action_work (action_key) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (action_key, user_id)
);

create index if not exists admin_action_assignees_user_idx on public.admin_action_assignees (user_id);

create table if not exists public.team_notes (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('action', 'customer', 'contact')),
  context_key text not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  mention_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists team_notes_context_idx
  on public.team_notes (context_type, context_key, created_at desc);

create table if not exists public.team_mention_notifications (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.team_notes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (note_id, user_id)
);

create index if not exists team_mention_notifications_user_idx
  on public.team_mention_notifications (user_id, read_at);

drop trigger if exists set_admin_action_work_updated_at on public.admin_action_work;
create trigger set_admin_action_work_updated_at
before update on public.admin_action_work
for each row execute function public.set_updated_at();

alter table public.admin_action_work enable row level security;
alter table public.admin_action_assignees enable row level security;
alter table public.team_notes enable row level security;
alter table public.team_mention_notifications enable row level security;

drop policy if exists "admin_action_work_admin_all" on public.admin_action_work;
create policy "admin_action_work_admin_all"
on public.admin_action_work for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_action_assignees_admin_all" on public.admin_action_assignees;
create policy "admin_action_assignees_admin_all"
on public.admin_action_assignees for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "team_notes_admin_all" on public.team_notes;
create policy "team_notes_admin_all"
on public.team_notes for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "team_mention_notifications_own" on public.team_mention_notifications;
create policy "team_mention_notifications_own"
on public.team_mention_notifications for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.admin_action_work to authenticated;
grant select, insert, update, delete on public.admin_action_assignees to authenticated;
grant select, insert, update, delete on public.team_notes to authenticated;
grant select, insert, update on public.team_mention_notifications to authenticated;

commit;
