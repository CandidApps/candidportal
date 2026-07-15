-- Find Solutions content editable from supplier admin.

alter table public.solution_providers
  add column if not exists description text,
  add column if not exists candid_recommended boolean not null default false,
  add column if not exists find_capabilities text[] not null default '{}'::text[],
  add column if not exists find_services text[] not null default '{}'::text[];

comment on column public.solution_providers.description is
  'Customer-facing Find Solutions description for this supplier.';
comment on column public.solution_providers.candid_recommended is
  'When true, highlight as Candid Recommended on the member Find Solutions page.';
comment on column public.solution_providers.find_capabilities is
  'Capability tags shown/filterable on Find Solutions (e.g. MS Teams, SIP Trunks).';
comment on column public.solution_providers.find_services is
  'Product/service tags shown/filterable on Find Solutions (e.g. SD-WAN, Contact Center).';
