-- Admin notification preferences + push subscriptions (TASK-034).
create table if not exists public.admin_notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preferences jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.admin_notification_preferences enable row level security;

drop policy if exists "anp owner all" on public.admin_notification_preferences;
create policy "anp owner all" on public.admin_notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.admin_push_subscriptions enable row level security;

drop policy if exists "aps owner all" on public.admin_push_subscriptions;
create policy "aps owner all" on public.admin_push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
