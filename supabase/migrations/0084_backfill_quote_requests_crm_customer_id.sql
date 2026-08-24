-- Link legacy admin-initiated quote requests to CRM accounts by company name.
-- Without crm_customer_id, portal members sharing an admin user_id saw every quote.

update public.quote_requests qr
set crm_customer_id = (
  select c.external_id
  from public.customers c
  where lower(trim(c.company)) = lower(trim(qr.company))
  order by
    case when c.external_id like 'bmw-merchant-%' then 0 else 1 end,
    c.external_id
  limit 1
)
where qr.crm_customer_id is null
  and qr.company is not null
  and trim(qr.company) <> ''
  and exists (
    select 1
    from public.customers c
    where lower(trim(c.company)) = lower(trim(qr.company))
  );
