-- Link bill analysis reviews to CRM accounts (admin portal preview / missing contact email).

begin;

alter table public.bill_analysis_reviews
  add column if not exists crm_customer_id text;

create index if not exists bill_analysis_reviews_crm_customer_idx
  on public.bill_analysis_reviews (crm_customer_id)
  where crm_customer_id is not null;

-- Backfill from linked account_services when available.
update public.bill_analysis_reviews r
set crm_customer_id = s.crm_customer_id
from public.account_services s
where r.account_service_id = s.id
  and r.crm_customer_id is null
  and s.crm_customer_id is not null;

-- Also backfill from admin preview emails: preview+{customerId}.{contactId}@candid.preview
update public.bill_analysis_reviews
set crm_customer_id = substring(customer_email from '^preview\+([^.]+)\.')
where crm_customer_id is null
  and customer_email ~ '^preview\+[^.]+\\.';

commit;
