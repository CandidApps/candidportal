-- Member-initiated review requests (savings opportunities & My Services)

begin;

create table if not exists public.member_review_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_service_id uuid references public.account_services (id) on delete set null,
  analysis_review_id uuid references public.bill_analysis_reviews (id) on delete set null,
  crm_customer_id text,
  request_source text not null check (request_source in ('savings_opportunity', 'my_services')),
  service_name text not null,
  vendor_name text,
  customer_name text,
  customer_email text,
  subject text not null,
  message text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_review_requests_user_id_idx
  on public.member_review_requests (user_id);

create index if not exists member_review_requests_status_idx
  on public.member_review_requests (status);

create index if not exists member_review_requests_crm_customer_idx
  on public.member_review_requests (crm_customer_id)
  where crm_customer_id is not null;

create index if not exists member_review_requests_service_idx
  on public.member_review_requests (account_service_id)
  where account_service_id is not null;

drop trigger if exists set_member_review_requests_updated_at on public.member_review_requests;
create trigger set_member_review_requests_updated_at
before update on public.member_review_requests
for each row execute function public.set_updated_at();

alter table public.member_review_requests enable row level security;

drop policy if exists "member_review_requests_select_own" on public.member_review_requests;
create policy "member_review_requests_select_own"
on public.member_review_requests for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "member_review_requests_insert_own" on public.member_review_requests;
create policy "member_review_requests_insert_own"
on public.member_review_requests for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "member_review_requests_admin_update" on public.member_review_requests;
create policy "member_review_requests_admin_update"
on public.member_review_requests for update to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert on table public.member_review_requests to authenticated;
grant update on table public.member_review_requests to authenticated;

commit;
