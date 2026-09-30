-- CR-0029: outreach updates get their own activity log instead of auto team notes.

create table if not exists public.admin_outreach_activity (
  id uuid primary key default gen_random_uuid(),
  outreach_account_id uuid references public.admin_outreach_accounts(id) on delete set null,
  customer_external_id text not null,
  author_id uuid references auth.users(id) on delete set null,
  note text,
  status text,
  snapshot jsonb not null default '{}'::jsonb,
  source_team_note_id uuid unique,
  created_at timestamptz not null default now()
);

create index if not exists admin_outreach_activity_customer_idx
  on public.admin_outreach_activity (customer_external_id, created_at desc);

alter table public.admin_outreach_activity enable row level security;

drop policy if exists admin_outreach_activity_admin_all on public.admin_outreach_activity;
create policy admin_outreach_activity_admin_all on public.admin_outreach_activity
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Copy historical auto-generated outreach team notes (non-destructive; deletion is a separate confirmed step).
insert into public.admin_outreach_activity (customer_external_id, author_id, note, source_team_note_id, created_at)
select tn.context_key, tn.author_id, tn.body, tn.id, tn.created_at
from public.team_notes tn
where tn.context_type = 'customer'
  and tn.body like 'Outreach update — %'
on conflict (source_team_note_id) do nothing;
