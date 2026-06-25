-- Per-assignee claim state so multiple teammates can claim a single action.
-- A row in admin_action_assignees now represents one person on an action:
--   * assigned_by = user_id  -> self-added (claimed directly)
--   * assigned_by != user_id -> assigned by a teammate (pending until claimed/rejected)
--   * claimed_at is not null  -> actively working on it (rendered green)

begin;

alter table public.admin_action_assignees
  add column if not exists claimed_at timestamptz;

-- Backfill: anything previously self-assigned is treated as already claimed.
update public.admin_action_assignees
set claimed_at = coalesce(claimed_at, assigned_at)
where assigned_by is null or assigned_by = user_id;

-- Mirror the legacy single-claimer field into the per-assignee model so existing
-- claims keep their green state.
update public.admin_action_assignees a
set claimed_at = coalesce(a.claimed_at, w.claimed_at)
from public.admin_action_work w
where a.action_key = w.action_key
  and w.claimed_by = a.user_id;

create index if not exists admin_action_assignees_claimed_idx
  on public.admin_action_assignees (action_key, claimed_at);

commit;
