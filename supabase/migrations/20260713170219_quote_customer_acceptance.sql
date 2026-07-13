-- Customer accept-quote on published analysis / quote requests.

begin;

alter table public.bill_analysis_reviews
  add column if not exists customer_accepted_at timestamptz,
  add column if not exists customer_acceptance jsonb;

alter table public.quote_requests
  add column if not exists customer_accepted_at timestamptz,
  add column if not exists customer_acceptance jsonb;

comment on column public.bill_analysis_reviews.customer_accepted_at is
  'When the customer accepted the published quote/proposal.';
comment on column public.bill_analysis_reviews.customer_acceptance is
  'Structured acceptance payload: details, contact, selected package totals.';
comment on column public.quote_requests.customer_accepted_at is
  'When the customer accepted the published quote.';
comment on column public.quote_requests.customer_acceptance is
  'Structured acceptance payload: details, contact, selected package totals.';

commit;
