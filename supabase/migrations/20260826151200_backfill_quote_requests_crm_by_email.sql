-- Backfill quote_requests.crm_customer_id from CRM contact email (stronger than company-only 0084).

update public.quote_requests qr
set
  crm_customer_id = matched.external_id,
  updated_at = now()
from (
  select distinct on (qr2.id)
    qr2.id as quote_id,
    c.external_id
  from public.quote_requests qr2
  inner join public.customer_contacts cc
    on lower(trim(cc.email)) = lower(trim(qr2.contact_email))
  inner join public.customers c
    on c.id = cc.customer_id
  where qr2.crm_customer_id is null
    and qr2.contact_email is not null
    and trim(qr2.contact_email) <> ''
  order by qr2.id, cc.is_primary desc, c.external_id
) matched
where qr.id = matched.quote_id;

-- Company name match for any still-orphaned rows (same logic as 0084).
update public.quote_requests qr
set
  crm_customer_id = (
    select c.external_id
    from public.customers c
    where lower(trim(c.company)) = lower(trim(qr.company))
    order by
      case when c.external_id like 'bmw-merchant-%' then 0 else 1 end,
      c.external_id
    limit 1
  ),
  updated_at = now()
where qr.crm_customer_id is null
  and qr.company is not null
  and trim(qr.company) <> ''
  and exists (
    select 1
    from public.customers c
    where lower(trim(c.company)) = lower(trim(qr.company))
  );
