begin;

-- ── Dialpad call log ───────────────────────────────────────────────
-- Durable record of company call history synced from the Dialpad API
-- (single company API key). Surfaced in MyAssistant so the team can see
-- recent calls, AI recaps, recordings, and transcripts in one place.
create table if not exists public.dialpad_calls (
  id text primary key,                       -- Dialpad call_id (stringified)
  direction text,                            -- inbound | outbound | unknown
  state text,                                -- hangup, completed, missed, voicemail, ...
  contact_name text,
  contact_email text,
  contact_phone text,
  external_number text,
  agent_name text,                           -- Dialpad user (target) name
  agent_email text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds numeric,
  was_recorded boolean not null default false,
  recording_url text,
  transcript_text text,
  recap_summary text,
  crm_customer_id uuid references public.customers (id) on delete set null,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dialpad_calls_started_idx
  on public.dialpad_calls (started_at desc);
create index if not exists dialpad_calls_customer_idx
  on public.dialpad_calls (crm_customer_id);

drop trigger if exists set_dialpad_calls_updated_at on public.dialpad_calls;
create trigger set_dialpad_calls_updated_at
before update on public.dialpad_calls
for each row execute function public.set_updated_at();

alter table public.dialpad_calls enable row level security;

drop policy if exists "dialpad_calls_admin_all" on public.dialpad_calls;
create policy "dialpad_calls_admin_all"
on public.dialpad_calls for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.dialpad_calls to authenticated;

commit;
