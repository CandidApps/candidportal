-- Supplier promos shown on Find Solutions (display-only; not calculated with cash back).

alter table public.solution_providers
  add column if not exists member_promos jsonb not null default '[]'::jsonb;

comment on column public.solution_providers.member_promos is
  'Customer-facing supplier promos on Find Solutions. JSON array of {id, title, details?, expiresOn?}. Display only — separate from member earnings / cash back.';
