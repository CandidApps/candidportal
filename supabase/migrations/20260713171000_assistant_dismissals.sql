-- Persistent dismissals for assistant brief items (missed calls, priorities, etc.).
-- localStorage-only "completed today" was wiping overnight and regenerating Dialpad callbacks.

begin;

create table if not exists public.assistant_dismissals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- call | call_contact | action | email | mention | priority_title | missed_title
  ref_type text not null,
  ref_id text not null,
  title text,
  created_at timestamptz not null default now(),
  unique (owner_id, ref_type, ref_id)
);

create index if not exists assistant_dismissals_owner_idx
  on public.assistant_dismissals (owner_id, created_at desc);

alter table public.assistant_dismissals enable row level security;

drop policy if exists "assistant_dismissals_admin_all" on public.assistant_dismissals;
create policy "assistant_dismissals_admin_all"
on public.assistant_dismissals for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.assistant_dismissals to authenticated;

commit;
