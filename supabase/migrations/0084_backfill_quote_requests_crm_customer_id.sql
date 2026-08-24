-- Link legacy admin-initiated quote requests to CRM accounts by company name.
-- Without crm_customer_id, portal members sharing an admin user_id saw every quote.

update public.quote_requests qr
set crm_customer_id = pick.external_id
from (
  select distinct on (lower(trim(qr2.company)))
    qr2.id as quote_id,
    c.external_id
  from public.quote_requests qr2
  join public.customers c
    on lower(trim(c.company)) = lower(trim(qr2.company))
  where qr2.crm_customer_id is null
    and qr2.company is not null
    and trim(qr2.company) <> ''
  order by
    lower(trim(qr2.company)),
    case when c.external_id like 'bmw-merchant-%' then 0 else 1 end,
    c.external_id
) pick
where qr.id = pick.quote_id
  and qr.crm_customer_id is null;
