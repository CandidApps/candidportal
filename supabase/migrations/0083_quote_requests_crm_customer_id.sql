-- Link admin/member quote requests to CRM accounts for account-page visibility.

alter table public.quote_requests
  add column if not exists crm_customer_id text;

create index if not exists quote_requests_crm_customer_id_idx
  on public.quote_requests (crm_customer_id)
  where crm_customer_id is not null;

comment on column public.quote_requests.crm_customer_id is
  'CRM customers.external_id for admin-initiated or account-linked quotes';
