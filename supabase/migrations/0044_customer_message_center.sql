-- Customer Message Center threads + messages (TASK-022).
create table if not exists public.customer_message_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text,
  category text not null default 'general',
  status text not null default 'open',
  critical boolean not null default false,
  supplier_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.customer_message_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author text not null default 'customer', -- 'customer' | 'ai' | 'team'
  body text not null default '',
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists customer_message_threads_user_idx on public.customer_message_threads (user_id, updated_at desc);
create index if not exists customer_messages_thread_idx on public.customer_messages (thread_id, created_at);

alter table public.customer_message_threads enable row level security;
alter table public.customer_messages enable row level security;

drop policy if exists "cmt owner all" on public.customer_message_threads;
create policy "cmt owner all" on public.customer_message_threads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cm owner all" on public.customer_messages;
create policy "cm owner all" on public.customer_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
