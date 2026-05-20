-- Merchant processing statement analysis (CandidPay engine)

begin;

alter table public.account_services
  add column if not exists service_type text,
  add column if not exists merchant_analysis jsonb;

create index if not exists account_services_service_type_idx
  on public.account_services (service_type)
  where service_type is not null;

commit;
