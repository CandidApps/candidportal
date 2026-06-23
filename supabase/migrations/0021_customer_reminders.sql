-- Admin-created customer tasks, reminders, and calendar events

begin;

create table if not exists public.customer_reminders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  deal_external_id text,
  kind text not null default 'task'
    check (kind in ('task', 'reminder', 'calendar')),
  title text not null,
  body text,
  due_at timestamptz,
  calendar_start_at timestamptz,
  calendar_end_at timestamptz,
  notify_portal boolean not null default false,
  notify_email boolean not null default false,
  contact_email text,
  portal_notified_at timestamptz,
  email_sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_reminders_customer_idx
  on public.customer_reminders (customer_id, status, created_at desc);

create index if not exists customer_reminders_deal_idx
  on public.customer_reminders (deal_external_id)
  where deal_external_id is not null;

drop trigger if exists set_customer_reminders_updated_at on public.customer_reminders;
create trigger set_customer_reminders_updated_at
before update on public.customer_reminders
for each row
execute function public.set_updated_at();

alter table public.customer_reminders enable row level security;

drop policy if exists "customer_reminders_admin_all" on public.customer_reminders;
create policy "customer_reminders_admin_all"
on public.customer_reminders for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.customer_reminders to authenticated;

alter table public.member_notifications
  add column if not exists reminder_id uuid references public.customer_reminders (id) on delete set null;

create index if not exists member_notifications_reminder_idx
  on public.member_notifications (reminder_id)
  where reminder_id is not null;

commit;
