-- Member notification preferences + link member uploads to CRM customer

alter table public.profiles
  add column if not exists notification_preferences jsonb not null default '{}'::jsonb;

comment on column public.profiles.notification_preferences is
  'Per-member email notification toggles (ticket_responses, analysis_complete, etc.)';

alter table public.account_services
  add column if not exists crm_customer_id text;

comment on column public.account_services.crm_customer_id is
  'External id of CRM customer (customers.external_id) when uploaded from scoped member portal';

create index if not exists account_services_crm_customer_id_idx
  on public.account_services (crm_customer_id)
  where crm_customer_id is not null;
