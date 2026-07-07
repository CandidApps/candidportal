-- Portal leads: quote request linkage + convert/close lifecycle (Phase 6).

begin;

alter table public.portal_leads
  alter column analysis_review_id drop not null;

alter table public.portal_leads
  add column if not exists quote_request_id uuid references public.quote_requests (id) on delete cascade;

create unique index if not exists portal_leads_quote_request_idx
  on public.portal_leads (quote_request_id)
  where quote_request_id is not null;

alter table public.portal_leads
  add column if not exists lead_source text not null default 'bill_analysis';

alter table public.portal_leads
  drop constraint if exists portal_leads_lead_source_check;

alter table public.portal_leads
  add constraint portal_leads_lead_source_check
  check (lead_source in ('bill_analysis', 'quote_request', 'manual'));

alter table public.portal_leads
  add column if not exists lifecycle text not null default 'open';

alter table public.portal_leads
  drop constraint if exists portal_leads_lifecycle_check;

alter table public.portal_leads
  add constraint portal_leads_lifecycle_check
  check (lifecycle in ('open', 'converted', 'closed'));

alter table public.portal_leads
  add column if not exists close_reason text;

alter table public.portal_leads
  drop constraint if exists portal_leads_close_reason_check;

alter table public.portal_leads
  add constraint portal_leads_close_reason_check
  check (close_reason is null or close_reason in ('lost', 'duplicate', 'spam', 'other'));

alter table public.portal_leads
  add column if not exists close_note text;

alter table public.portal_leads
  add column if not exists converted_customer_id uuid references public.customers (id) on delete set null;

alter table public.portal_leads
  drop constraint if exists portal_leads_source_key_check;

alter table public.portal_leads
  add constraint portal_leads_source_key_check
  check (
    analysis_review_id is not null
    or quote_request_id is not null
    or lead_source = 'manual'
  );

create index if not exists portal_leads_lifecycle_idx
  on public.portal_leads (lifecycle)
  where lifecycle = 'open';

commit;
