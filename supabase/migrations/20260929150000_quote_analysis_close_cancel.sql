-- CR-0090: close / cancel quote requests and bill analyses (admin + member), with who/when/why and reopen.
alter table public.quote_requests drop constraint if exists quote_requests_status_check;
alter table public.quote_requests
  add constraint quote_requests_status_check
  check (status in ('open', 'in_progress', 'resolved', 'submitted', 'closed', 'cancelled'));

alter table public.quote_requests
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_by_email text,
  add column if not exists close_reason text,
  add column if not exists status_before_close text;

alter table public.bill_analysis_reviews drop constraint if exists bill_analysis_reviews_status_check;
alter table public.bill_analysis_reviews
  add constraint bill_analysis_reviews_status_check
  check (status in ('pending_review', 'in_progress', 'published', 'dismissed', 'closed', 'cancelled'));

alter table public.bill_analysis_reviews
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_by_email text,
  add column if not exists close_reason text,
  add column if not exists status_before_close text;

comment on column public.quote_requests.status_before_close is
  'Status to restore when an admin reopens a closed/cancelled quote request.';
comment on column public.bill_analysis_reviews.status_before_close is
  'Status to restore when an admin reopens a closed/cancelled analysis.';
