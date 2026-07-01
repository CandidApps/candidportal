-- Rich notes, due datetime, source linking, and overdue tracking for assistant tasks.

alter table public.assistant_tasks
  add column if not exists notes_html text,
  add column if not exists due_at timestamptz,
  add column if not exists original_due_at timestamptz,
  add column if not exists source_meta jsonb;

update public.assistant_tasks
set due_at = (due_date::text || 'T12:00:00Z')::timestamptz
where due_date is not null and due_at is null;

alter table public.assistant_tasks drop constraint if exists assistant_tasks_source_check;
alter table public.assistant_tasks add constraint assistant_tasks_source_check
  check (source in ('manual', 'email', 'recap', 'action', 'mention', 'call', 'brief'));

create index if not exists assistant_tasks_due_at_idx
  on public.assistant_tasks (due_at)
  where due_at is not null and status <> 'done';
