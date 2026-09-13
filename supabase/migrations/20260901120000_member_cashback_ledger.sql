-- CR-0001 phase 2: member cash back ledger (pending → earned → paid).

begin;

create table if not exists public.member_cashback_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_external_id text not null,
  quote_request_id uuid references public.quote_requests (id) on delete set null,
  contract_submit_action_id uuid references public.contract_submit_actions (id) on delete set null,
  deal_external_id text,
  vendor_name text,
  provider_slug text,
  cashback_pct numeric(6, 2),
  basis_monthly numeric(12, 2),
  amount_monthly numeric(12, 2),
  status text not null default 'pending'
    check (status in ('pending', 'earned', 'paid')),
  member_agent_comm_id text,
  source text not null default 'quote_accept',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_cashback_ledger_customer_status_idx
  on public.member_cashback_ledger (customer_external_id, status, created_at desc);

create unique index if not exists member_cashback_ledger_action_uidx
  on public.member_cashback_ledger (contract_submit_action_id)
  where contract_submit_action_id is not null;

alter table public.member_cashback_ledger enable row level security;

drop policy if exists "member_cashback_ledger_admin_all" on public.member_cashback_ledger;
create policy "member_cashback_ledger_admin_all"
on public.member_cashback_ledger for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.member_cashback_ledger to authenticated;

commit;
