-- Allow admins to mark relationship-pulse issues as handled
-- (e.g. resolved by phone even if email still looks "awaiting reply").
alter table public.customer_sentiment
  add column if not exists resolved_through_at timestamptz,
  add column if not exists resolve_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid;

comment on column public.customer_sentiment.resolved_through_at is
  'Last inbound contact timestamp that was marked handled; later inbounds can reopen awaiting_reply.';
