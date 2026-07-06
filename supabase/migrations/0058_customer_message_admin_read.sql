-- Admin read state for customer Message Center threads (unread badge + mark unread).
alter table public.customer_message_threads
  add column if not exists admin_read_at timestamptz;

create index if not exists customer_message_threads_admin_unread_idx
  on public.customer_message_threads (status, admin_read_at)
  where admin_read_at is null;
