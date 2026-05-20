-- Customer questions on merchant analysis → tickets for Candid admin team

begin;

create table if not exists public.analysis_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_service_id uuid references public.account_services (id) on delete set null,
  customer_email text,
  customer_name text,
  merchant_name text,
  question text not null,
  last_ai_reply text,
  status text not null default 'open'
    check (status in ('open', 'resolved')),
  analysis_context jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analysis_tickets_user_id_idx
  on public.analysis_tickets (user_id);

create index if not exists analysis_tickets_status_idx
  on public.analysis_tickets (status);

create index if not exists analysis_tickets_created_at_idx
  on public.analysis_tickets (created_at desc);

drop trigger if exists set_analysis_tickets_updated_at on public.analysis_tickets;
create trigger set_analysis_tickets_updated_at
before update on public.analysis_tickets
for each row
execute function public.set_updated_at();

alter table public.analysis_tickets enable row level security;

drop policy if exists "analysis_tickets_insert_own" on public.analysis_tickets;
create policy "analysis_tickets_insert_own"
on public.analysis_tickets
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "analysis_tickets_select_own" on public.analysis_tickets;
create policy "analysis_tickets_select_own"
on public.analysis_tickets
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "analysis_tickets_select_admin" on public.analysis_tickets;
create policy "analysis_tickets_select_admin"
on public.analysis_tickets
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

drop policy if exists "analysis_tickets_update_admin" on public.analysis_tickets;
create policy "analysis_tickets_update_admin"
on public.analysis_tickets
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

grant select, insert, update on table public.analysis_tickets to authenticated;

commit;
