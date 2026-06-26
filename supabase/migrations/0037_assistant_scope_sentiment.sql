begin;

-- ── MyAssistant: train-for-me vs train-for-team scope ──────────────
-- Lets a teammate teach Hank a fact that's either private to them
-- ('personal') or shared with the whole Candid team ('team').
alter table public.assistant_context
  add column if not exists scope text not null default 'personal'
    check (scope in ('personal', 'team'));

create index if not exists assistant_context_scope_idx
  on public.assistant_context (scope, created_at desc);

-- ── Customer relationship sentiment (account "pulse") ──────────────
-- Cached AI + heuristic read on how a customer relationship is going so
-- the accounts overview can surface at-risk / neglected relationships,
-- similar to an AI contact center.
create table if not exists public.customer_sentiment (
  customer_id text primary key,
  level text not null default 'neutral'
    check (level in ('good', 'neutral', 'at_risk', 'urgent', 'unknown')),
  headline text not null default '',
  signals jsonb not null default '[]'::jsonb,
  last_contact_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  awaiting_reply boolean not null default false,
  generated_at timestamptz not null default now()
);

alter table public.customer_sentiment enable row level security;

drop policy if exists "customer_sentiment_admin_all" on public.customer_sentiment;
create policy "customer_sentiment_admin_all"
on public.customer_sentiment for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.customer_sentiment to authenticated;

commit;
