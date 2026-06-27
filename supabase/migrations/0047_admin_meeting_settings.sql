-- Per-admin meeting (conference) settings: a reusable meeting link + rich-text
-- meeting description that can be inserted into new calendar events.
create table if not exists public.admin_meeting_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  meeting_link text not null default '',
  meeting_description text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.admin_meeting_settings enable row level security;

drop policy if exists "ams owner all" on public.admin_meeting_settings;
create policy "ams owner all" on public.admin_meeting_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Storage: meeting-attachments (public) ────────────────────────────────────
-- Public so files linked from a meeting description are reachable by attendees.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-attachments',
  'meeting-attachments',
  true,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/csv',
    'text/plain'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meeting_attachments_public_read" on storage.objects;
create policy "meeting_attachments_public_read"
on storage.objects for select to public
using (bucket_id = 'meeting-attachments');

drop policy if exists "meeting_attachments_admin_insert" on storage.objects;
create policy "meeting_attachments_admin_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'meeting-attachments' and public.is_admin());

drop policy if exists "meeting_attachments_admin_delete" on storage.objects;
create policy "meeting_attachments_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'meeting-attachments' and public.is_admin());
