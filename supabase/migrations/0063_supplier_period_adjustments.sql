-- Supplier commission reconciliation adjustments (close deposit vs report variance).

begin;

create table if not exists public.supplier_period_adjustments (
  id uuid primary key default gen_random_uuid(),
  supplier_id text not null,
  period text not null,
  amount numeric not null,
  resolution_type text not null,
  agent_merge_keys jsonb not null default '[]'::jsonb,
  show_on_agent_report boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, period)
);

alter table public.supplier_period_adjustments enable row level security;

drop policy if exists "supplier_period_adjustments_admin_all" on public.supplier_period_adjustments;
create policy "supplier_period_adjustments_admin_all"
on public.supplier_period_adjustments for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.supplier_period_adjustments to authenticated;

commit;
