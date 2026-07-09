-- Allow expense review to reimburse someone other than the submitter (e.g. submitted on their behalf).

begin;

alter table public.admin_expenses
  add column if not exists commission_reimburse_profile_id uuid references public.profiles (id) on delete set null;

create index if not exists admin_expenses_reimburse_profile_idx
  on public.admin_expenses (commission_reimburse_profile_id)
  where commission_reimburse_profile_id is not null;

commit;
