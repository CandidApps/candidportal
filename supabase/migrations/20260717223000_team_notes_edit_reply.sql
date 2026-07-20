-- Team notes: replies + edit tracking
alter table public.team_notes
  add column if not exists parent_note_id uuid references public.team_notes (id) on delete cascade,
  add column if not exists updated_at timestamptz;

update public.team_notes
set updated_at = created_at
where updated_at is null;

alter table public.team_notes
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists team_notes_parent_idx
  on public.team_notes (parent_note_id)
  where parent_note_id is not null;
