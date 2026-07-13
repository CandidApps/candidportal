-- solution_providers.id is bigint; contract_submit_actions.provider_id was uuid by mistake.
alter table public.contract_submit_actions
  alter column provider_id type text using provider_id::text;
