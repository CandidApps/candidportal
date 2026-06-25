-- Per-user (and shared mailbox) Zoho Mail OAuth connections.
-- Refresh tokens are encrypted at rest by the app (AES-256-GCM) before storage.

begin;

create table if not exists public.zoho_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_id text,
  email text,
  display_name text,
  refresh_token_enc text not null,
  scope text,
  -- Marks the shared mailbox used for automated/system emails.
  is_shared boolean not null default false,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one connection may act as the shared system mailbox.
create unique index if not exists zoho_connections_one_shared_idx
  on public.zoho_connections (is_shared)
  where is_shared = true;

create index if not exists zoho_connections_email_idx on public.zoho_connections (email);

drop trigger if exists set_zoho_connections_updated_at on public.zoho_connections;
create trigger set_zoho_connections_updated_at
before update on public.zoho_connections
for each row execute function public.set_updated_at();

alter table public.zoho_connections enable row level security;

-- Owner can see/manage their own row; admins can manage all. Server routes use
-- the service role and bypass RLS, but this keeps direct access locked down.
drop policy if exists "zoho_connections_owner_or_admin" on public.zoho_connections;
create policy "zoho_connections_owner_or_admin"
on public.zoho_connections for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.zoho_connections to authenticated;

commit;
