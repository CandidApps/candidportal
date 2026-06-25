begin;

-- ── MyAssistant: personal + team tasks ─────────────────────────────
create table if not exists public.assistant_tasks (
  id uuid primary key default gen_random_uuid(),
  -- The team member responsible for the task (assignee). Defaults to creator.
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'done')),
  due_date date,
  -- Where the task came from: manual, or seeded from another surface.
  source text not null default 'manual'
    check (source in ('manual', 'email', 'recap', 'action', 'mention')),
  source_ref text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_tasks_owner_idx
  on public.assistant_tasks (owner_id, status, due_date);
create index if not exists assistant_tasks_creator_idx
  on public.assistant_tasks (created_by, status);

drop trigger if exists set_assistant_tasks_updated_at on public.assistant_tasks;
create trigger set_assistant_tasks_updated_at
before update on public.assistant_tasks
for each row execute function public.set_updated_at();

alter table public.assistant_tasks enable row level security;

drop policy if exists "assistant_tasks_admin_all" on public.assistant_tasks;
create policy "assistant_tasks_admin_all"
on public.assistant_tasks for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.assistant_tasks to authenticated;

-- ── Allow task threads to reuse the team-notes mention system ───────
alter table public.team_notes drop constraint if exists team_notes_context_type_check;
alter table public.team_notes add constraint team_notes_context_type_check
  check (context_type in ('action', 'customer', 'contact', 'task'));

commit;
