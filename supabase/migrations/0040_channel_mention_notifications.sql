-- Allow @mention notifications to originate from Message Center channel posts,
-- not just team_notes. Channel mentions were parsed onto team_messages but never
-- surfaced in MyMentions because notifications only referenced team_notes.

begin;

alter table public.team_mention_notifications
  alter column note_id drop not null;

alter table public.team_mention_notifications
  add column if not exists message_id uuid references public.team_messages (id) on delete cascade,
  add column if not exists channel_id uuid references public.team_channels (id) on delete cascade;

create unique index if not exists team_mention_notifications_message_user_key
  on public.team_mention_notifications (message_id, user_id)
  where message_id is not null;

create index if not exists team_mention_notifications_message_idx
  on public.team_mention_notifications (message_id)
  where message_id is not null;

commit;
