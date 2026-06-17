-- Customer service tickets, bill upload fingerprints, member onboarding flags

begin;

-- ── Profile flags (welcome modal, analysis paywall unlock) ─────────────────
alter table public.profiles
  add column if not exists welcome_seen_at timestamptz,
  add column if not exists analysis_unlocked_at timestamptz;

comment on column public.profiles.welcome_seen_at is
  'When the member dismissed the first-login welcome modal.';
comment on column public.profiles.analysis_unlocked_at is
  'When the member unlocked full analysis (e.g. one-time payment).';

-- ── Customer service tickets (My Services → Open ticket) ───────────────────
create table if not exists public.customer_service_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_service_id uuid references public.account_services (id) on delete set null,
  service_name text not null,
  subject text not null,
  message text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved')),
  customer_name text,
  customer_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_service_tickets_user_id_idx
  on public.customer_service_tickets (user_id);

create index if not exists customer_service_tickets_status_idx
  on public.customer_service_tickets (status);

create index if not exists customer_service_tickets_created_at_idx
  on public.customer_service_tickets (created_at desc);

drop trigger if exists set_customer_service_tickets_updated_at on public.customer_service_tickets;
create trigger set_customer_service_tickets_updated_at
before update on public.customer_service_tickets
for each row
execute function public.set_updated_at();

alter table public.customer_service_tickets enable row level security;

drop policy if exists "customer_service_tickets_insert_own" on public.customer_service_tickets;
create policy "customer_service_tickets_insert_own"
on public.customer_service_tickets
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "customer_service_tickets_select_own" on public.customer_service_tickets;
create policy "customer_service_tickets_select_own"
on public.customer_service_tickets
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "customer_service_tickets_select_admin" on public.customer_service_tickets;
create policy "customer_service_tickets_select_admin"
on public.customer_service_tickets
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "customer_service_tickets_update_admin" on public.customer_service_tickets;
create policy "customer_service_tickets_update_admin"
on public.customer_service_tickets
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (true);

grant select, insert, update on table public.customer_service_tickets to authenticated;

-- ── Bill upload fingerprints (duplicate bill detection) ────────────────────
create table if not exists public.bill_upload_fingerprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fingerprint text not null,
  original_filename text,
  created_at timestamptz not null default now(),
  constraint bill_upload_fingerprints_user_fp_unique unique (user_id, fingerprint)
);

create index if not exists bill_upload_fingerprints_user_id_idx
  on public.bill_upload_fingerprints (user_id);

alter table public.bill_upload_fingerprints enable row level security;

drop policy if exists "bill_upload_fingerprints_select_own" on public.bill_upload_fingerprints;
create policy "bill_upload_fingerprints_select_own"
on public.bill_upload_fingerprints
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "bill_upload_fingerprints_insert_own" on public.bill_upload_fingerprints;
create policy "bill_upload_fingerprints_insert_own"
on public.bill_upload_fingerprints
for insert
to authenticated
with check (user_id = auth.uid());

grant select, insert on table public.bill_upload_fingerprints to authenticated;

commit;
