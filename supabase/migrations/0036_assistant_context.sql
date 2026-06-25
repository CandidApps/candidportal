begin;

-- ── MyAssistant: memory / learning store ───────────────────────────
-- Lightweight facts the assistant remembers about people, businesses, and
-- preferences so its brief + chat get smarter over time.
create table if not exists public.assistant_context (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  info text not null,
  -- 'manual' (user added), 'chat' (assistant learned), 'recap' (from a call)
  source text not null default 'manual'
    check (source in ('manual', 'chat', 'recap', 'email')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_context_owner_idx
  on public.assistant_context (owner_id, created_at desc);

drop trigger if exists set_assistant_context_updated_at on public.assistant_context;
create trigger set_assistant_context_updated_at
before update on public.assistant_context
for each row execute function public.set_updated_at();

alter table public.assistant_context enable row level security;

drop policy if exists "assistant_context_admin_all" on public.assistant_context;
create policy "assistant_context_admin_all"
on public.assistant_context for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.assistant_context to authenticated;

-- ── MyAssistant: per-user AI brief cache ───────────────────────────
-- Caches the generated week brief so it persists between visits and can be
-- refreshed on demand.
create table if not exists public.assistant_briefs (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  brief jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

alter table public.assistant_briefs enable row level security;

drop policy if exists "assistant_briefs_admin_all" on public.assistant_briefs;
create policy "assistant_briefs_admin_all"
on public.assistant_briefs for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.assistant_briefs to authenticated;

commit;
