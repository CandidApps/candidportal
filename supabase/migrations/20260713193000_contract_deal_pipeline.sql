-- Contract deal pipeline: stages, activity log, lead deal_stage.
-- Lead stays open until customer signs / admin converts.

begin;

-- Expand contract_submit_actions status to deal stages
alter table public.contract_submit_actions drop constraint if exists contract_submit_actions_status_check;

update public.contract_submit_actions set status = 'quote_accepted' where status in ('open', 'in_progress');
-- leave 'resolved' as-is for now; map terminal resolved rows that aren't converted
update public.contract_submit_actions set status = 'customer_contract_signed' where status = 'resolved';

alter table public.contract_submit_actions
  add column if not exists vendor_name text,
  add column if not exists provider_id uuid,
  add column if not exists pay_source text,
  add column if not exists paysource_partner_id text,
  add column if not exists supplier_contact_email text,
  add column if not exists contract_url text,
  add column if not exists contract_filename text,
  add column if not exists lead_id uuid,
  add column if not exists crm_customer_external_id text,
  add column if not exists customer_submit_action_id uuid;

alter table public.contract_submit_actions
  add constraint contract_submit_actions_status_check
  check (status in (
    'quote_accepted',
    'supplier_contract_requested',
    'supplier_contract_received',
    'customer_contract_sent',
    'customer_contract_signed',
    'converted'
  ));

alter table public.portal_leads
  add column if not exists deal_stage text;

-- Backfill deal_stage from linked submit actions where possible
update public.portal_leads pl
set deal_stage = csa.status
from public.contract_submit_actions csa
where csa.lead_id = pl.id
  and (pl.deal_stage is null or pl.deal_stage = '');

-- Reopen leads that were prematurely converted on quote accept but deal not fully converted
update public.portal_leads pl
set
  lifecycle = 'open',
  deal_stage = coalesce(nullif(pl.deal_stage, ''), 'quote_accepted')
where pl.lifecycle = 'converted'
  and exists (
    select 1
    from public.contract_submit_actions csa
    where (
      (csa.analysis_review_id is not null and csa.analysis_review_id = pl.analysis_review_id)
      or (csa.quote_request_id is not null and csa.quote_request_id = pl.quote_request_id)
    )
    and csa.status not in ('converted', 'customer_contract_signed')
  );

-- Link submit actions to leads
update public.contract_submit_actions csa
set lead_id = pl.id
from public.portal_leads pl
where csa.lead_id is null
  and (
    (csa.analysis_review_id is not null and csa.analysis_review_id = pl.analysis_review_id)
    or (csa.quote_request_id is not null and csa.quote_request_id = pl.quote_request_id)
  );

update public.portal_leads pl
set deal_stage = 'quote_accepted'
where pl.deal_stage is null
  and exists (
    select 1 from public.contract_submit_actions csa
    where (
      (csa.analysis_review_id is not null and csa.analysis_review_id = pl.analysis_review_id)
      or (csa.quote_request_id is not null and csa.quote_request_id = pl.quote_request_id)
    )
  );

create table if not exists public.deal_activity_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.portal_leads (id) on delete set null,
  contract_submit_action_id uuid references public.contract_submit_actions (id) on delete cascade,
  crm_customer_external_id text,
  event_type text not null
    check (event_type in ('status_change', 'email_sent', 'email_received', 'note', 'converted')),
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists deal_activity_events_lead_idx
  on public.deal_activity_events (lead_id, created_at desc);
create index if not exists deal_activity_events_action_idx
  on public.deal_activity_events (contract_submit_action_id, created_at desc);
create index if not exists deal_activity_events_customer_idx
  on public.deal_activity_events (crm_customer_external_id, created_at desc)
  where crm_customer_external_id is not null;

alter table public.deal_activity_events enable row level security;

drop policy if exists "deal_activity_events_admin_all" on public.deal_activity_events;
create policy "deal_activity_events_admin_all"
on public.deal_activity_events for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.deal_activity_events to authenticated;

-- Seed activity for existing submit actions
insert into public.deal_activity_events (
  lead_id, contract_submit_action_id, event_type, to_status, payload, created_at
)
select
  csa.lead_id,
  csa.id,
  'status_change',
  csa.status,
  jsonb_build_object('note', 'Backfilled from existing contract submit action'),
  csa.created_at
from public.contract_submit_actions csa
where not exists (
  select 1 from public.deal_activity_events e
  where e.contract_submit_action_id = csa.id
);

commit;
