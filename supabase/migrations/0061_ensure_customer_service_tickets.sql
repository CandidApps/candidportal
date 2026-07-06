-- Ensure customer_service_tickets exists (required for Get help → escalate to ticket).
-- Idempotent re-apply of 0005 in case that migration was skipped on this project.

begin;

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

commit;
