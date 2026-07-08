-- Internal team expense allocation: reimburse submitter or split among partners.

begin;

alter table public.admin_expenses
  add column if not exists commission_internal_splits jsonb not null default '[]'::jsonb;

commit;
