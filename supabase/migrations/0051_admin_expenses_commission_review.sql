-- Commission workflow step 3: queue, review, include/reject, and agent/customer allocation.
alter table public.admin_expenses
  add column if not exists queued_for_commission boolean not null default false,
  add column if not exists commission_review_status text not null default 'pending',
  add column if not exists commission_allocation_type text,
  add column if not exists commission_agent_id text,
  add column if not exists commission_deduction_note text,
  add column if not exists commission_rejection_note text;

create index if not exists admin_expenses_review_status_idx
  on public.admin_expenses (commission_period, commission_review_status)
  where commission_period is not null;

-- Legacy "pull from commission" rows become queued for step 3 review (no immediate deduction).
update public.admin_expenses
set queued_for_commission = true
where pull_from_commission = true and not queued_for_commission;

update public.admin_expenses
set queued_for_commission = true,
    commission_review_status = 'pending'
where commission_period is not null
  and commission_review_status = 'pending'
  and not queued_for_commission;
