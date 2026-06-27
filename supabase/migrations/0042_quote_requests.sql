-- Customer-submitted quote / add-services requests (TASK-023, TASK-026).
create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null default 'request',
  contact_name text,
  company text,
  contact_email text,
  contact_phone text,
  services text[] not null default '{}',
  note text,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_requests_user_id_idx on public.quote_requests (user_id);
create index if not exists quote_requests_status_idx on public.quote_requests (status);

alter table public.quote_requests enable row level security;

drop policy if exists "quote_requests owner read" on public.quote_requests;
create policy "quote_requests owner read" on public.quote_requests
  for select using (auth.uid() = user_id);

drop policy if exists "quote_requests owner insert" on public.quote_requests;
create policy "quote_requests owner insert" on public.quote_requests
  for insert with check (auth.uid() = user_id);
