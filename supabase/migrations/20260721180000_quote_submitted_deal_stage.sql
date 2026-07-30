-- Add quote_submitted as the first contract deal pipeline stage.

begin;

alter table public.contract_submit_actions drop constraint if exists contract_submit_actions_status_check;

alter table public.contract_submit_actions
  add constraint contract_submit_actions_status_check
  check (status in (
    'quote_submitted',
    'quote_accepted',
    'supplier_contract_requested',
    'supplier_contract_received',
    'customer_contract_sent',
    'customer_contract_signed',
    'converted'
  ));

commit;
