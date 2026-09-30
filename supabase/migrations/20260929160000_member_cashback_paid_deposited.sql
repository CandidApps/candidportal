-- CR-0001: member cash back paid / deposited status.
-- paid      = Candid has sent the payout.
-- deposited = funds confirmed in the member's account.

alter table public.member_cashback_ledger
  drop constraint if exists member_cashback_ledger_status_check;

alter table public.member_cashback_ledger
  add constraint member_cashback_ledger_status_check
  check (status in ('pending', 'earned', 'paid', 'deposited'));

alter table public.member_cashback_ledger
  add column if not exists paid_at timestamptz,
  add column if not exists deposited_at timestamptz;
