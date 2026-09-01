-- Change-control queue: structured specs + team review dispositions for Cursor.

begin;

create sequence if not exists public.product_change_request_seq start 1;

create or replace function public.next_product_change_public_id()
returns text
language sql
as $$
  select 'CR-' || lpad(nextval('public.product_change_request_seq')::text, 4, '0');
$$;

create table if not exists public.product_change_requests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default public.next_product_change_public_id(),
  title text not null,
  change_type text not null
    check (change_type in ('bug', 'ui', 'flow', 'feature', 'enhancement', 'tech_debt', 'content')),
  priority text not null default 'p2'
    check (priority in ('p0', 'p1', 'p2', 'p3')),
  status text not null default 'draft'
    check (status in (
      'draft', 'in_review', 'changes_requested',
      'accepted_ready', 'accepted_needs_design', 'accepted_needs_spike', 'accepted_blocked',
      'deferred', 'rejected', 'in_progress', 'done'
    )),
  screen text not null default '',
  user_role text not null default 'both'
    check (user_role in ('admin', 'member', 'both', 'partner')),
  current_behavior text not null default '',
  desired_behavior text not null default '',
  user_flow_steps text not null default '',
  acceptance_criteria text not null default '',
  out_of_scope text not null default '',
  app_areas text not null default '',
  related_files text not null default '',
  data_migration text not null default 'none'
    check (data_migration in ('none', 'maybe', 'yes')),
  risk_notes text not null default '',
  demo_impact text not null default '',
  owner text not null default '',
  reviewers text not null default '',
  milestone_id uuid references public.product_roadmap_items (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_change_requests_status_idx
  on public.product_change_requests (status);
create index if not exists product_change_requests_created_idx
  on public.product_change_requests (created_at desc);

create table if not exists public.product_change_reviews (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.product_change_requests (id) on delete cascade,
  reviewer_email text not null,
  disposition text not null
    check (disposition in (
      'changes_requested',
      'accepted_ready',
      'accepted_needs_design',
      'accepted_needs_spike',
      'accepted_blocked',
      'deferred',
      'rejected'
    )),
  comment text not null default '',
  risks text not null default '',
  must_preserve text not null default '',
  blast_radius text not null default 'local'
    check (blast_radius in ('local', 'feature', 'cross_cutting')),
  created_at timestamptz not null default now()
);

create index if not exists product_change_reviews_cr_idx
  on public.product_change_reviews (change_request_id, created_at desc);

create table if not exists public.product_change_events (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid references public.product_change_requests (id) on delete set null,
  event_type text not null,
  summary text not null,
  before_state jsonb,
  after_state jsonb,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists product_change_events_created_idx
  on public.product_change_events (created_at desc);

drop trigger if exists set_product_change_requests_updated_at on public.product_change_requests;
create trigger set_product_change_requests_updated_at
before update on public.product_change_requests
for each row
execute function public.set_updated_at();

alter table public.product_change_requests enable row level security;
alter table public.product_change_reviews enable row level security;
alter table public.product_change_events enable row level security;

grant select, insert, update, delete on table public.product_change_requests to service_role;
grant select, insert, update, delete on table public.product_change_reviews to service_role;
grant select, insert, update, delete on table public.product_change_events to service_role;
grant usage, select on sequence public.product_change_request_seq to service_role;
grant execute on function public.next_product_change_public_id() to service_role;

commit;
