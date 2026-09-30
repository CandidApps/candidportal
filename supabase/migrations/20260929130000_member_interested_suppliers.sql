-- CR-0084: member "Interested" list (persisted shortlist) shown in the top bar and Interested page.
create table if not exists public.member_interested_suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  supplier_name text not null,
  category text,
  provider_id bigint references public.solution_providers (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, supplier_name)
);

create index if not exists member_interested_suppliers_user_idx
  on public.member_interested_suppliers (user_id, created_at desc);

alter table public.member_interested_suppliers enable row level security;

drop policy if exists "member_interested_select_own" on public.member_interested_suppliers;
create policy "member_interested_select_own" on public.member_interested_suppliers
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "member_interested_insert_own" on public.member_interested_suppliers;
create policy "member_interested_insert_own" on public.member_interested_suppliers
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "member_interested_delete_own" on public.member_interested_suppliers;
create policy "member_interested_delete_own" on public.member_interested_suppliers
  for delete to authenticated using (user_id = (select auth.uid()));
