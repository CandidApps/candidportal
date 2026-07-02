-- Leads from portal bill analysis + link message threads to reviews (Prompt E).

begin;

create table if not exists public.portal_leads (
  id uuid primary key default gen_random_uuid(),
  analysis_review_id uuid not null unique references public.bill_analysis_reviews (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  lead_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists portal_leads_created_at_idx on public.portal_leads (created_at desc);

alter table public.portal_leads enable row level security;

drop policy if exists "portal_leads_admin_all" on public.portal_leads;
create policy "portal_leads_admin_all"
on public.portal_leads for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.portal_leads to authenticated;

alter table public.customer_message_threads
  add column if not exists analysis_review_id uuid references public.bill_analysis_reviews (id) on delete set null;

create unique index if not exists customer_message_threads_analysis_review_idx
  on public.customer_message_threads (analysis_review_id)
  where analysis_review_id is not null;

commit;
