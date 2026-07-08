-- Expense review v2: submitter display, multi-customer, tier charge, defer/rollover, resubmit.

begin;

alter table public.admin_expenses
  add column if not exists commission_customer_ids jsonb not null default '[]'::jsonb,
  add column if not exists commission_charge_mode text,
  add column if not exists commission_charge_tier_rate numeric(5, 2),
  add column if not exists commission_charge_amount numeric(12, 2),
  add column if not exists commission_target_period text,
  add column if not exists resubmitted_from_id uuid references public.admin_expenses (id) on delete set null;

-- Backfill single customer into multi-customer array when present.
update public.admin_expenses
set commission_customer_ids = jsonb_build_array(
  jsonb_build_object(
    'id', customer_id,
    'name', coalesce(customer_name, ''),
    'agent', coalesce(customer_agent, '')
  )
)
where customer_id is not null
  and (commission_customer_ids is null or commission_customer_ids = '[]'::jsonb);

create index if not exists admin_expenses_target_period_idx
  on public.admin_expenses (commission_target_period)
  where commission_target_period is not null;

create index if not exists admin_expenses_owner_review_idx
  on public.admin_expenses (owner_id, commission_review_status);

commit;
