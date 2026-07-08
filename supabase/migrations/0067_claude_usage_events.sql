-- Claude / Anthropic usage events for cost analytics (admin only).

begin;

create table if not exists public.claude_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  route_label text not null,
  user_id uuid references auth.users (id) on delete set null,
  model text not null default 'claude-sonnet-4-6',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  max_tokens integer,
  estimated_cost_usd numeric(12, 6) not null default 0
);

create index if not exists claude_usage_events_created_idx
  on public.claude_usage_events (created_at desc);

create index if not exists claude_usage_events_route_idx
  on public.claude_usage_events (route_label, created_at desc);

create index if not exists claude_usage_events_user_idx
  on public.claude_usage_events (user_id, created_at desc);

alter table public.claude_usage_events enable row level security;

drop policy if exists "claude_usage_events_admin_select" on public.claude_usage_events;
create policy "claude_usage_events_admin_select"
on public.claude_usage_events for select to authenticated
using (public.is_admin());

-- Inserts go through service-role / admin client from API routes; no user INSERT policy.

grant select on public.claude_usage_events to authenticated;

commit;
