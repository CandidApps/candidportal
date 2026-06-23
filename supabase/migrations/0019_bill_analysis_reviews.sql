-- Bill uploads queued for admin analysis review before customer-facing savings

begin;

create table if not exists public.bill_analysis_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_service_id uuid references public.account_services (id) on delete set null,
  customer_email text,
  customer_name text,
  vendor_name text not null,
  filename text,
  bill_storage_path text,
  detected_category text not null default 'other',
  category_label text,
  parse_result jsonb not null default '{}'::jsonb,
  draft_snapshot jsonb,
  published_snapshot jsonb,
  matched_provider_slug text,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'in_progress', 'published', 'dismissed')),
  admin_notes text,
  submitted_at timestamptz,
  submitted_by uuid references auth.users (id) on delete set null,
  customer_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bill_analysis_reviews_user_id_idx
  on public.bill_analysis_reviews (user_id);

create index if not exists bill_analysis_reviews_status_idx
  on public.bill_analysis_reviews (status);

create index if not exists bill_analysis_reviews_created_at_idx
  on public.bill_analysis_reviews (created_at desc);

create index if not exists bill_analysis_reviews_service_idx
  on public.bill_analysis_reviews (account_service_id)
  where account_service_id is not null;

alter table public.account_services
  add column if not exists analysis_review_id uuid references public.bill_analysis_reviews (id) on delete set null;

drop trigger if exists set_bill_analysis_reviews_updated_at on public.bill_analysis_reviews;
create trigger set_bill_analysis_reviews_updated_at
before update on public.bill_analysis_reviews
for each row
execute function public.set_updated_at();

alter table public.bill_analysis_reviews enable row level security;

drop policy if exists "bill_analysis_reviews_select_own" on public.bill_analysis_reviews;
create policy "bill_analysis_reviews_select_own"
on public.bill_analysis_reviews for select to authenticated
using (user_id = auth.uid());

drop policy if exists "bill_analysis_reviews_admin_all" on public.bill_analysis_reviews;
create policy "bill_analysis_reviews_admin_all"
on public.bill_analysis_reviews for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "bill_analysis_reviews_insert_own" on public.bill_analysis_reviews;
create policy "bill_analysis_reviews_insert_own"
on public.bill_analysis_reviews for insert to authenticated
with check (user_id = auth.uid());

grant select, insert, update on table public.bill_analysis_reviews to authenticated;

-- Member portal notifications (analysis published, etc.)
create table if not exists public.member_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'general',
  title text not null,
  body text not null,
  account_service_id uuid references public.account_services (id) on delete set null,
  analysis_review_id uuid references public.bill_analysis_reviews (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists member_notifications_user_id_idx
  on public.member_notifications (user_id, created_at desc);

alter table public.member_notifications enable row level security;

drop policy if exists "member_notifications_select_own" on public.member_notifications;
create policy "member_notifications_select_own"
on public.member_notifications for select to authenticated
using (user_id = auth.uid());

drop policy if exists "member_notifications_update_own" on public.member_notifications;
create policy "member_notifications_update_own"
on public.member_notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "member_notifications_admin_insert" on public.member_notifications;
create policy "member_notifications_admin_insert"
on public.member_notifications for insert to authenticated
with check (public.is_admin());

grant select, update on table public.member_notifications to authenticated;
grant insert on table public.member_notifications to authenticated;

commit;
