-- Quote request publish snapshots, supplier RFQ audit, message thread link

begin;

alter table public.quote_requests
  add column if not exists draft_quote_snapshot jsonb,
  add column if not exists published_quote_snapshot jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists admin_notes text;

alter table public.customer_message_threads
  add column if not exists quote_request_id uuid references public.quote_requests (id) on delete set null;

create unique index if not exists customer_message_threads_quote_request_idx
  on public.customer_message_threads (quote_request_id)
  where quote_request_id is not null;

alter table public.member_notifications
  add column if not exists quote_request_id uuid references public.quote_requests (id) on delete set null;

create index if not exists member_notifications_quote_request_idx
  on public.member_notifications (quote_request_id)
  where quote_request_id is not null;

create table if not exists public.quote_supplier_rfqs (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests (id) on delete cascade,
  provider_id integer references public.solution_providers (id) on delete set null,
  provider_name text not null,
  contact_name text,
  contact_email text not null,
  status text not null default 'sent' check (status in ('draft', 'sent')),
  rfq_subject text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists quote_supplier_rfqs_request_idx
  on public.quote_supplier_rfqs (quote_request_id, sent_at desc);

alter table public.quote_supplier_rfqs enable row level security;

drop policy if exists "quote_supplier_rfqs_admin_all" on public.quote_supplier_rfqs;
create policy "quote_supplier_rfqs_admin_all"
on public.quote_supplier_rfqs for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.quote_supplier_rfqs to authenticated;

-- Admin access to customer Message Center (inbox)
drop policy if exists "cmt admin select" on public.customer_message_threads;
create policy "cmt admin select"
on public.customer_message_threads for select to authenticated
using (public.is_admin());

drop policy if exists "cm admin select" on public.customer_messages;
create policy "cm admin select"
on public.customer_messages for select to authenticated
using (public.is_admin());

drop policy if exists "cm admin insert team" on public.customer_messages;
create policy "cm admin insert team"
on public.customer_messages for insert to authenticated
with check (public.is_admin() and author = 'team');

drop policy if exists "cmt admin update" on public.customer_message_threads;
create policy "cmt admin update"
on public.customer_message_threads for update to authenticated
using (public.is_admin()) with check (public.is_admin());

commit;
