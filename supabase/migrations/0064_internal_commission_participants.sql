-- Internal team commission participants (partners, internal employees) — house-net splits.

begin;

create table if not exists public.internal_commission_participants (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  participant_type text not null default 'partner'
    check (participant_type in ('partner', 'internal_employee', 'inactive')),
  default_house_share_percent numeric(5, 2) not null default 0
    check (default_house_share_percent >= 0 and default_house_share_percent <= 100),
  -- For internal employees: % of house net before partner split (e.g. 5).
  house_share_rate_of_net numeric(5, 2)
    check (house_share_rate_of_net is null or (house_share_rate_of_net >= 0 and house_share_rate_of_net <= 100)),
  optional_agent_comm_id text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  updated_at timestamptz not null default now()
);

create index if not exists internal_commission_participants_status_idx
  on public.internal_commission_participants (status, participant_type);

alter table public.internal_commission_participants enable row level security;

drop policy if exists "internal_commission_participants_admin_all" on public.internal_commission_participants;
create policy "internal_commission_participants_admin_all"
on public.internal_commission_participants for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.internal_commission_participants to authenticated;

commit;
