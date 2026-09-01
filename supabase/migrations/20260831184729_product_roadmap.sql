-- Product roadmap tracker for admin GTM/project planning with change history.

begin;

create table if not exists public.product_roadmap_items (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.product_roadmap_items (id) on delete cascade,
  kind text not null check (kind in ('objective', 'milestone', 'task')),
  title text not null,
  description text not null default '',
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'done', 'blocked', 'deferred', 'cancelled')),
  owner text not null default '',
  phase text not null default '',
  app_area text not null default '',
  sort_order integer not null default 0,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_roadmap_items_parent_idx
  on public.product_roadmap_items (parent_id);
create index if not exists product_roadmap_items_phase_idx
  on public.product_roadmap_items (phase);
create index if not exists product_roadmap_items_sort_idx
  on public.product_roadmap_items (sort_order);

create table if not exists public.product_roadmap_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.product_roadmap_items (id) on delete set null,
  event_type text not null
    check (event_type in (
      'created', 'updated', 'status_changed', 'reassigned',
      'deleted', 'note', 'path_change', 'seeded'
    )),
  summary text not null,
  before_state jsonb,
  after_state jsonb,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists product_roadmap_events_created_idx
  on public.product_roadmap_events (created_at desc);
create index if not exists product_roadmap_events_item_idx
  on public.product_roadmap_events (item_id);

drop trigger if exists set_product_roadmap_items_updated_at on public.product_roadmap_items;
create trigger set_product_roadmap_items_updated_at
before update on public.product_roadmap_items
for each row
execute function public.set_updated_at();

alter table public.product_roadmap_items enable row level security;
alter table public.product_roadmap_events enable row level security;

-- Admin-only via service role from API; no direct client policies needed.
-- Keep RLS on; grants for authenticated are optional (API uses service role).

grant select, insert, update, delete on table public.product_roadmap_items to service_role;
grant select, insert, update, delete on table public.product_roadmap_events to service_role;

-- Seed from CandidIQ GTM Plan (Aug 2026) if empty
do $$
declare
  obj_id uuid;
  m_id uuid;
begin
  if exists (select 1 from public.product_roadmap_items limit 1) then
    return;
  end if;

  insert into public.product_roadmap_items (kind, title, description, status, owner, phase, app_area, sort_order, target_date)
  values (
    'objective',
    '25 customers by day 90 (beta-first)',
    'Invite 10 existing SMB clients into free beta, expand to 25 by day 90, then turn on paid when product is stable. Sharpest wedge: merchant/telecom savings analysis → published proposal → Message Center + My Services.',
    'in_progress',
    'Bryan',
    'North star',
    'Portal overall',
    0,
    '2026-11-23'
  )
  returning id into obj_id;

  -- Phase A
  insert into public.product_roadmap_items (parent_id, kind, title, description, status, owner, phase, app_area, sort_order, target_date)
  values (obj_id, 'milestone', 'Phase A — Beta prep (Weeks 1–2)', 'Core flows work; immature features hidden or scoped. Exit: 3 internal demos without failures; invite flow works.', 'in_progress', 'Dev + Bryan', 'Phase A', 'Platform stability', 10, '2026-09-14')
  returning id into m_id;

  insert into public.product_roadmap_items (parent_id, kind, title, description, status, owner, phase, app_area, sort_order) values
  (m_id, 'task', 'Beta bug list — rank blockers vs annoyances', 'Document known glitches before inviting humans.', 'planned', 'Dev', 'Phase A', 'Action Center / portal', 11),
  (m_id, 'task', 'Beta scope doc — what we demo', 'My Services, analysis, quotes, Message Center.', 'planned', 'Product', 'Phase A', 'Member portal', 12),
  (m_id, 'task', 'Hide/defer Tech Spend unless ready', 'Keep Plaid out of beta demos until stable.', 'planned', 'Dev', 'Phase A', 'Tech Spend', 13),
  (m_id, 'task', 'Portal invite E2E test', 'Invite → set password → land in app.', 'planned', 'Dev', 'Phase A', 'Auth / invites', 14),
  (m_id, 'task', 'Pick 10 beta accounts', 'From existing SMB clients.', 'planned', 'Sales/Bryan', 'Phase A', 'CRM Accounts', 15),
  (m_id, 'task', 'Beta agreement email', 'Free access, feedback expected, features evolving.', 'planned', 'Bryan', 'Phase A', 'GTM / ops', 16);

  -- Phase B
  insert into public.product_roadmap_items (parent_id, kind, title, description, status, owner, phase, app_area, sort_order, target_date)
  values (obj_id, 'milestone', 'Phase B — Founding beta (Weeks 3–8)', '10 free customers. Real usage, published wins. Exit: ≥6/10 active monthly; ≥3 published wins.', 'planned', 'Bryan + team', 'Phase B', 'Member portal', 20, '2026-10-26')
  returning id into m_id;

  insert into public.product_roadmap_items (parent_id, kind, title, description, status, owner, phase, app_area, sort_order) values
  (m_id, 'task', 'Send beta invites (10)', 'Existing Candid SMB only — no cold outbound.', 'planned', 'Bryan', 'Phase B', 'Portal invites', 21),
  (m_id, 'task', '8/10 logged in at least once', 'Track activation.', 'planned', 'Ops', 'Phase B', 'Member portal', 22),
  (m_id, 'task', '5+ free savings analyses completed', 'Publish merchant/telecom analyses.', 'planned', 'Specialists', 'Phase B', 'Bill analysis / Quotes', 23),
  (m_id, 'task', '3+ published deliverables', 'Analysis or quote accepted/published.', 'planned', 'Specialists', 'Phase B', 'Quotes & Proposals', 24),
  (m_id, 'task', 'Weekly beta feedback', 'Call or async check-in for 10 weeks.', 'planned', 'Bryan', 'Phase B', 'Message Center', 25);

  -- Phase C
  insert into public.product_roadmap_items (parent_id, kind, title, description, status, owner, phase, app_area, sort_order, target_date)
  values (obj_id, 'milestone', 'Phase C — Expand to 25 (Weeks 9–12)', '90-day goal: 25 portal customers. Still free unless someone offers to pay.', 'planned', 'Bryan', 'Phase C', 'CRM / growth', 30, '2026-11-23')
  returning id into m_id;

  insert into public.product_roadmap_items (parent_id, kind, title, description, status, owner, phase, app_area, sort_order) values
  (m_id, 'task', 'Invite wave 2 (+10–15)', 'Similar ICP, existing relationships.', 'planned', 'Sales/Bryan', 'Phase C', 'Portal invites', 31),
  (m_id, 'task', 'Hit 25 total portal customers', 'North-star count.', 'planned', 'Team', 'Phase C', 'CRM Accounts', 32),
  (m_id, 'task', 'Draft 1 case study from beta', 'Named win for later paid launch.', 'planned', 'Marketing', 'Phase C', 'Marketing Hub', 33),
  (m_id, 'task', 'Paid launch go / no-go meeting', 'Decide readiness to charge.', 'planned', 'Bryan', 'Phase C', 'GTM / billing', 34);

  -- Phase D
  insert into public.product_roadmap_items (parent_id, kind, title, description, status, owner, phase, app_area, sort_order, target_date)
  values (obj_id, 'milestone', 'Phase D — Paid launch (when ready)', 'Billing, Terms, Privacy, convert beta → Complete (discounted), first net-new paid.', 'planned', 'Bryan + Dev', 'Phase D', 'Billing', 40, null)
  returning id into m_id;

  insert into public.product_roadmap_items (parent_id, kind, title, description, status, owner, phase, app_area, sort_order) values
  (m_id, 'task', 'Billing (Stripe or invoicing)', 'Collect subscription per tiers.', 'planned', 'Dev', 'Phase D', 'Billing', 41),
  (m_id, 'task', 'Terms + Privacy linked', 'Signup and footer.', 'planned', 'Legal/Bryan', 'Phase D', 'Legal / site', 42),
  (m_id, 'task', 'Existing-client discount published', 'Founding pricing for Candid clients.', 'planned', 'Bryan', 'Phase D', 'Pricing', 43),
  (m_id, 'task', 'Convert engaged beta → Complete', 'Discounted paid conversion.', 'planned', 'Sales', 'Phase D', 'CRM Accounts', 44),
  (m_id, 'task', 'First net-new paid customer', 'Outside existing Candid base.', 'planned', 'Sales', 'Phase D', 'Growth', 45);

  -- Phase E (lighter)
  insert into public.product_roadmap_items (parent_id, kind, title, description, status, owner, phase, app_area, sort_order)
  values (obj_id, 'milestone', 'Phase E — Post-25 (Months 4–12)', 'Paid conversion, Tech Spend GA if stable, member Frank, partners after SMB stable.', 'deferred', 'Team', 'Phase E', 'Roadmap backlog', 50);

  insert into public.product_roadmap_events (item_id, event_type, summary, after_state, actor_email)
  values (
    obj_id,
    'seeded',
    'Seeded roadmap from CandidIQ GTM Plan (Aug 25, 2026) — beta-first path to 25 customers.',
    jsonb_build_object('source', 'docs/CandidIQ-GTM-PLAN.md', 'phases', jsonb_build_array('A','B','C','D','E')),
    'system'
  );
end $$;

commit;
