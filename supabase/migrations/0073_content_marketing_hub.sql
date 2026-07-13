-- Content Marketing Hub: centralized marketing assets for admin (future: agent) dashboard

begin;

create table if not exists public.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null check (
    category in ('logo', 'branding', 'pdf', 'email_template', 'marketing_content')
  ),
  filename text not null,
  storage_path text not null,
  mime_type text,
  file_size_label text,
  tags text[] not null default '{}',
  uploaded_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_assets_category_idx
  on public.marketing_assets (category);

create index if not exists marketing_assets_created_at_idx
  on public.marketing_assets (created_at desc);

drop trigger if exists set_marketing_assets_updated_at on public.marketing_assets;
create trigger set_marketing_assets_updated_at
before update on public.marketing_assets
for each row
execute function public.set_updated_at();

alter table public.marketing_assets enable row level security;

drop policy if exists "marketing_assets_admin_all" on public.marketing_assets;
create policy "marketing_assets_admin_all"
on public.marketing_assets for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.marketing_assets to authenticated;

-- Private bucket for marketing assets (admin-only via RLS)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-assets',
  'marketing-assets',
  false,
  52428800,
  array[
    'application/pdf',
    'text/html',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'image/gif'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "marketing_assets_storage_admin_select" on storage.objects;
create policy "marketing_assets_storage_admin_select"
on storage.objects for select to authenticated
using (bucket_id = 'marketing-assets' and public.is_admin());

drop policy if exists "marketing_assets_storage_admin_insert" on storage.objects;
create policy "marketing_assets_storage_admin_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'marketing-assets' and public.is_admin());

drop policy if exists "marketing_assets_storage_admin_update" on storage.objects;
create policy "marketing_assets_storage_admin_update"
on storage.objects for update to authenticated
using (bucket_id = 'marketing-assets' and public.is_admin())
with check (bucket_id = 'marketing-assets' and public.is_admin());

drop policy if exists "marketing_assets_storage_admin_delete" on storage.objects;
create policy "marketing_assets_storage_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'marketing-assets' and public.is_admin());

commit;
