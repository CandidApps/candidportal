begin;

-- Link each call to the Dialpad user (line) and matched portal profile.
alter table public.dialpad_calls
  add column if not exists dialpad_user_id text,
  add column if not exists agent_profile_id uuid references public.profiles (id) on delete set null;

create index if not exists dialpad_calls_dialpad_user_idx
  on public.dialpad_calls (dialpad_user_id)
  where dialpad_user_id is not null;

create index if not exists dialpad_calls_agent_profile_idx
  on public.dialpad_calls (agent_profile_id)
  where agent_profile_id is not null;

commit;
