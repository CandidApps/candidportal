-- CR-0090 amendment: member Decline / Request modification / Cancel on quotes and analyses, with reasons.
alter table public.quote_requests
  add column if not exists customer_response jsonb;

alter table public.bill_analysis_reviews
  add column if not exists customer_response jsonb;

comment on column public.quote_requests.customer_response is
  'Latest member response other than accept: {action: decline|request_changes|cancel, reasons[], details, at, byEmail}.';
comment on column public.bill_analysis_reviews.customer_response is
  'Latest member response other than accept: {action: decline|request_changes|cancel, reasons[], details, at, byEmail}.';
