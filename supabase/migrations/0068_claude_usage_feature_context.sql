-- Friendly feature context for Claude usage analytics.

begin;

alter table public.claude_usage_events
  add column if not exists feature_area text,
  add column if not exists feature_name text,
  add column if not exists usage_trigger text;

create index if not exists claude_usage_events_area_idx
  on public.claude_usage_events (feature_area, created_at desc);

create index if not exists claude_usage_events_feature_idx
  on public.claude_usage_events (feature_name, created_at desc);

commit;
