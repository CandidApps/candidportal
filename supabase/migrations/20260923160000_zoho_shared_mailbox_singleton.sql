-- Shared system mailbox is a singleton, independent of each admin's personal
-- Zoho connection. Connecting a personal mailbox must never overwrite shared.

begin;

create table if not exists public.zoho_shared_mailbox (
  -- Singleton row (always id = true)
  id boolean primary key default true check (id),
  account_id text,
  email text,
  display_name text,
  refresh_token_enc text not null,
  scope text,
  access_token_enc text,
  access_token_expires_at timestamptz,
  connected_by_user_id uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_zoho_shared_mailbox_updated_at on public.zoho_shared_mailbox;
create trigger set_zoho_shared_mailbox_updated_at
before update on public.zoho_shared_mailbox
for each row execute function public.set_updated_at();

alter table public.zoho_shared_mailbox enable row level security;

-- No direct client access; server uses service role.
drop policy if exists "zoho_shared_mailbox_admin_read" on public.zoho_shared_mailbox;
create policy "zoho_shared_mailbox_admin_read"
on public.zoho_shared_mailbox for select to authenticated
using (public.is_admin());

-- Migrate any existing is_shared connection into the singleton (keep personal rows).
insert into public.zoho_shared_mailbox (
  id,
  account_id,
  email,
  display_name,
  refresh_token_enc,
  scope,
  access_token_enc,
  access_token_expires_at,
  connected_by_user_id,
  connected_at
)
select
  true,
  c.account_id,
  c.email,
  c.display_name,
  c.refresh_token_enc,
  c.scope,
  c.access_token_enc,
  c.access_token_expires_at,
  c.user_id,
  c.connected_at
from public.zoho_connections c
where c.is_shared = true
on conflict (id) do nothing;

-- If nothing was marked shared (legacy demotions), seed from the newest connection
-- so invites keep working until support@ is reconnected as shared.
insert into public.zoho_shared_mailbox (
  id,
  account_id,
  email,
  display_name,
  refresh_token_enc,
  scope,
  access_token_enc,
  access_token_expires_at,
  connected_by_user_id,
  connected_at
)
select
  true,
  c.account_id,
  c.email,
  c.display_name,
  c.refresh_token_enc,
  c.scope,
  c.access_token_enc,
  c.access_token_expires_at,
  c.user_id,
  c.connected_at
from public.zoho_connections c
where not exists (select 1 from public.zoho_shared_mailbox where id = true)
order by c.connected_at desc nulls last
limit 1
on conflict (id) do nothing;

-- Demote shared flags so personal zoho_connections rows stay personal-only.
update public.zoho_connections
set is_shared = false
where is_shared = true;

commit;
