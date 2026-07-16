-- Extend outreach with CRM-linked fields, activity-friendly columns, and per-user column prefs.

begin;

alter table public.admin_outreach_accounts
  drop constraint if exists admin_outreach_accounts_status_check;

update public.admin_outreach_accounts
set status = case status
  when 'not_contacted' then 'not_started'
  when 'contacted' then 'connected'
  when 'no_response' then 'attempted_contact'
  when 'interested' then 'opportunity_identified'
  when 'closed' then 'completed'
  else status
end
where status in ('not_contacted', 'contacted', 'no_response', 'interested', 'closed');

alter table public.admin_outreach_accounts
  add constraint admin_outreach_accounts_status_check
  check (status in (
    'not_started',
    'attempted_contact',
    'connected',
    'follow_up_needed',
    'information_sent',
    'waiting_on_customer',
    'opportunity_identified',
    'completed',
    'do_not_contact'
  ));

alter table public.admin_outreach_accounts
  alter column status set default 'not_started';

alter table public.admin_outreach_accounts
  add column if not exists contact_id uuid references public.customer_contacts (id) on delete set null;

alter table public.admin_outreach_accounts
  add column if not exists last_contacted_at date;

alter table public.admin_outreach_accounts
  add column if not exists next_follow_up_at date;

alter table public.admin_outreach_accounts
  add column if not exists follow_up_owner_user_id uuid references auth.users (id) on delete set null;

alter table public.admin_outreach_accounts
  add column if not exists how_can_we_help text not null default 'no_current_need';

alter table public.admin_outreach_accounts
  drop constraint if exists admin_outreach_accounts_how_can_we_help_check;

alter table public.admin_outreach_accounts
  add constraint admin_outreach_accounts_how_can_we_help_check
  check (how_can_we_help in (
    'payment_processing',
    'internet',
    'phones_ucaas',
    'microsoft_licensing',
    'cybersecurity',
    'managed_it',
    'website_services',
    'software_development',
    'other',
    'no_current_need'
  ));

alter table public.admin_outreach_accounts
  add column if not exists current_provider text;

alter table public.admin_outreach_accounts
  add column if not exists pain_points text;

alter table public.admin_outreach_accounts
  add column if not exists assigned_user_ids uuid[] not null default '{}';

alter table public.admin_outreach_accounts
  add column if not exists linked_reminder_id uuid references public.customer_reminders (id) on delete set null;

alter table public.admin_outreach_accounts
  add column if not exists linked_lead_id uuid references public.portal_leads (id) on delete set null;

update public.admin_outreach_accounts
set how_can_we_help = 'other'
where coalesce(trim(how_else_help), '') <> ''
  and how_can_we_help = 'no_current_need';

create index if not exists admin_outreach_accounts_status_idx
  on public.admin_outreach_accounts (status);

create index if not exists admin_outreach_accounts_follow_up_idx
  on public.admin_outreach_accounts (next_follow_up_at)
  where next_follow_up_at is not null;

create index if not exists admin_outreach_accounts_help_idx
  on public.admin_outreach_accounts (how_can_we_help);

create index if not exists admin_outreach_accounts_contact_idx
  on public.admin_outreach_accounts (contact_id)
  where contact_id is not null;

create table if not exists public.admin_outreach_column_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  visible_columns text[] not null default '{}',
  column_order text[] not null default '{}',
  updated_at timestamptz not null default now()
);

drop trigger if exists set_admin_outreach_column_prefs_updated_at on public.admin_outreach_column_prefs;
create trigger set_admin_outreach_column_prefs_updated_at
before update on public.admin_outreach_column_prefs
for each row
execute function public.set_updated_at();

alter table public.admin_outreach_column_prefs enable row level security;

drop policy if exists "admin_outreach_column_prefs_owner_all" on public.admin_outreach_column_prefs;
create policy "admin_outreach_column_prefs_owner_all"
on public.admin_outreach_column_prefs for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.admin_outreach_column_prefs to authenticated;

commit;