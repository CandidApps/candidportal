-- Message Center: team chat channels, DMs, and messages (with @hank + @mentions)

begin;

create table if not exists public.team_channels (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'channel' check (kind in ('channel', 'dm')),
  name text,
  topic text,
  is_general boolean not null default false,
  dm_key text unique,
  created_by uuid references auth.users (id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists team_channels_kind_idx on public.team_channels (kind, last_message_at desc);

create table if not exists public.team_channel_members (
  channel_id uuid not null references public.team_channels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists team_channel_members_user_idx on public.team_channel_members (user_id);

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.team_channels (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_kind text not null default 'user' check (author_kind in ('user', 'hank', 'system')),
  body text not null,
  mention_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists team_messages_channel_idx on public.team_messages (channel_id, created_at);

-- Keep channel.last_message_at fresh for cheap unread + ordering
create or replace function public.bump_channel_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.team_channels
    set last_message_at = new.created_at
    where id = new.channel_id;
  return new;
end;
$$;

drop trigger if exists team_messages_bump on public.team_messages;
create trigger team_messages_bump
after insert on public.team_messages
for each row execute function public.bump_channel_last_message();

-- Membership helper avoids recursive RLS lookups in policies
create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_channel_members m
    where m.channel_id = p_channel_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_open_channel(p_channel_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_channels c
    where c.id = p_channel_id and c.kind = 'channel'
  );
$$;

alter table public.team_channels enable row level security;
alter table public.team_channel_members enable row level security;
alter table public.team_messages enable row level security;

-- Channels: visible to any admin if open; DMs only to members
drop policy if exists "team_channels_select" on public.team_channels;
create policy "team_channels_select"
on public.team_channels for select to authenticated
using (
  public.is_admin() and (kind = 'channel' or public.is_channel_member(id))
);

drop policy if exists "team_channels_write" on public.team_channels;
create policy "team_channels_write"
on public.team_channels for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "team_channel_members_all" on public.team_channel_members;
create policy "team_channel_members_all"
on public.team_channel_members for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Messages: readable in open channels or DMs you belong to
drop policy if exists "team_messages_select" on public.team_messages;
create policy "team_messages_select"
on public.team_messages for select to authenticated
using (
  public.is_admin() and (public.is_open_channel(channel_id) or public.is_channel_member(channel_id))
);

drop policy if exists "team_messages_write" on public.team_messages;
create policy "team_messages_write"
on public.team_messages for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.team_channels to authenticated;
grant select, insert, update, delete on public.team_channel_members to authenticated;
grant select, insert, update, delete on public.team_messages to authenticated;

-- Realtime: stream new messages (and unread bumps) to clients
do $$
begin
  alter publication supabase_realtime add table public.team_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.team_channels;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.team_mention_notifications;
exception when duplicate_object then null;
end $$;

-- Seed a default #general channel
insert into public.team_channels (kind, name, topic, is_general)
select 'channel', 'general', 'Company-wide team chat', true
where not exists (select 1 from public.team_channels where is_general = true);

commit;
