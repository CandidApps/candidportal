-- Run in Supabase Dashboard → SQL Editor (Get help: member_service_requests + customer_service_tickets).
-- Safe to re-run (idempotent). After running, wait ~30s or run the NOTIFY at the bottom.

begin;

-- ── 0059: member_service_requests ───────────────────────────────────────────
create table if not exists public.member_service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  subject text not null,
  message text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'resolved_self_service')),
  outcome text not null
    check (outcome in ('self_service', 'escalated_ticket', 'escalated_review')),
  account_service_id uuid,
  service_name text,
  vendor_name text,
  customer_name text,
  customer_email text,
  guide_id uuid,
  guide_title text,
  linked_ticket_id uuid,
  linked_review_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_service_requests_user_created_idx
  on public.member_service_requests (user_id, created_at desc);

create index if not exists member_service_requests_status_idx
  on public.member_service_requests (status, created_at desc);

drop trigger if exists set_member_service_requests_updated_at on public.member_service_requests;
create trigger set_member_service_requests_updated_at
before update on public.member_service_requests
for each row execute function public.set_updated_at();

alter table public.member_service_requests enable row level security;

drop policy if exists "member_service_requests_select_own" on public.member_service_requests;
create policy "member_service_requests_select_own"
on public.member_service_requests for select to authenticated
using (user_id = auth.uid());

drop policy if exists "member_service_requests_insert_own" on public.member_service_requests;
create policy "member_service_requests_insert_own"
on public.member_service_requests for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "member_service_requests_admin" on public.member_service_requests;
create policy "member_service_requests_admin"
on public.member_service_requests for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on table public.member_service_requests to authenticated;

-- ── 0061: customer_service_tickets ──────────────────────────────────────────
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
for each row execute function public.set_updated_at();

alter table public.customer_service_tickets enable row level security;

drop policy if exists "customer_service_tickets_insert_own" on public.customer_service_tickets;
create policy "customer_service_tickets_insert_own"
on public.customer_service_tickets for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "customer_service_tickets_select_own" on public.customer_service_tickets;
create policy "customer_service_tickets_select_own"
on public.customer_service_tickets for select to authenticated
using (user_id = auth.uid());

drop policy if exists "customer_service_tickets_select_admin" on public.customer_service_tickets;
create policy "customer_service_tickets_select_admin"
on public.customer_service_tickets for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "customer_service_tickets_update_admin" on public.customer_service_tickets;
create policy "customer_service_tickets_update_admin"
on public.customer_service_tickets for update to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (true);

grant select, insert, update on table public.customer_service_tickets to authenticated;

commit;

-- Refresh PostgREST schema cache so the API sees the new tables immediately.
notify pgrst, 'reload schema';
