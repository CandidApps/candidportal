-- UI screenshots / reference files for change requests (multi-file).

create table if not exists public.product_change_attachments (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.product_change_requests (id) on delete cascade,
  storage_path text not null,
  file_name text not null default '',
  content_type text not null default 'application/octet-stream',
  byte_size integer not null default 0,
  uploaded_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists product_change_attachments_cr_idx
  on public.product_change_attachments (change_request_id, created_at desc);

alter table public.product_change_attachments enable row level security;

grant select, insert, update, delete on table public.product_change_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'change-request-attachments',
  'change-request-attachments',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'application/pdf'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
