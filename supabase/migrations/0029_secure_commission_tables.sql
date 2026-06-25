-- Lock down commission tables that had RLS disabled.
-- All app access goes through the service-role admin API (/api/admin/supplier-commissions),
-- which bypasses RLS, so an admin-only policy does not affect functionality.

begin;

alter table public."Payjunction" enable row level security;
alter table public."PaymentCloud" enable row level security;
alter table public.appdirect_commissions enable row level security;
alter table public.cardconnect_commissions enable row level security;
alter table public.intelisys_commissions enable row level security;
alter table public.sandlerpartners_commissions enable row level security;
alter table public.telarus_commissions enable row level security;

-- Remove any legacy wide-open policies
drop policy if exists "anon_all" on public."Payjunction";
drop policy if exists "anon_all" on public."PaymentCloud";
drop policy if exists "anon_all" on public.appdirect_commissions;
drop policy if exists "anon_all" on public.cardconnect_commissions;
drop policy if exists "anon_all" on public.intelisys_commissions;
drop policy if exists "anon_all" on public.sandlerpartners_commissions;
drop policy if exists "anon_all" on public.telarus_commissions;

drop policy if exists "payjunction_admin_all" on public."Payjunction";
create policy "payjunction_admin_all"
on public."Payjunction" for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "paymentcloud_admin_all" on public."PaymentCloud";
create policy "paymentcloud_admin_all"
on public."PaymentCloud" for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "appdirect_commissions_admin_all" on public.appdirect_commissions;
create policy "appdirect_commissions_admin_all"
on public.appdirect_commissions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cardconnect_commissions_admin_all" on public.cardconnect_commissions;
create policy "cardconnect_commissions_admin_all"
on public.cardconnect_commissions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "intelisys_commissions_admin_all" on public.intelisys_commissions;
create policy "intelisys_commissions_admin_all"
on public.intelisys_commissions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sandlerpartners_commissions_admin_all" on public.sandlerpartners_commissions;
create policy "sandlerpartners_commissions_admin_all"
on public.sandlerpartners_commissions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "telarus_commissions_admin_all" on public.telarus_commissions;
create policy "telarus_commissions_admin_all"
on public.telarus_commissions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Revoke anon access entirely (service_role bypasses RLS for the admin API)
revoke all on public."Payjunction" from anon;
revoke all on public."PaymentCloud" from anon;
revoke all on public.appdirect_commissions from anon;
revoke all on public.cardconnect_commissions from anon;
revoke all on public.intelisys_commissions from anon;
revoke all on public.sandlerpartners_commissions from anon;
revoke all on public.telarus_commissions from anon;

commit;
