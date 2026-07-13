-- Account / business name on contract deals (distinct from contact person in customer_name).
alter table public.contract_submit_actions
  add column if not exists account_name text;

comment on column public.contract_submit_actions.account_name is
  'Business / CRM account name for the deal; customer_name is the contact person.';
