-- Personal Dialpad phone number for meeting / bridge settings.
alter table public.admin_meeting_settings
  add column if not exists dialpad_number text not null default '';
