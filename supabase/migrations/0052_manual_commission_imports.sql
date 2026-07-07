-- Persist admin manual commission uploads (AppDirect, Telarus, etc.) so they
-- survive across browsers and environments instead of living in localStorage only.

begin;

create table if not exists public.manual_commission_imports (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  period text not null,
  amount_field text not null,
  filename text,
  imported_at timestamptz not null default now(),
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_commission_imports_supplier_period_key unique (supplier, period),
  constraint manual_commission_imports_period_format check (period ~ '^\d{4}-\d{2}$')
);

create index if not exists manual_commission_imports_period_idx
  on public.manual_commission_imports (period desc);

alter table public.manual_commission_imports enable row level security;

drop policy if exists "manual_commission_imports_admin_all" on public.manual_commission_imports;
create policy "manual_commission_imports_admin_all"
on public.manual_commission_imports for all to authenticated
using (public.is_admin()) with check (public.is_admin());

revoke all on public.manual_commission_imports from anon;

commit;
