-- Custom uploaded logos for solution providers (fallback when favicon lookup fails).

alter table public.solution_providers
  add column if not exists logo_url text,
  add column if not exists logo_storage_path text;

comment on column public.solution_providers.logo_url is
  'Public URL for an admin-uploaded supplier logo (preferred over favicon lookup).';

comment on column public.solution_providers.logo_storage_path is
  'Storage object path in the app bucket for the uploaded logo.';
