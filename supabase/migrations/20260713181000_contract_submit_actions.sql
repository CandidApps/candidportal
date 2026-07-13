-- Accepted-quote follow-up: submit contract actions + who published the quote.

begin;

alter table public.bill_analysis_reviews
  add column if not exists published_by uuid references auth.users (id) on delete set null;

alter table public.quote_requests
  add column if not exists published_by uuid references auth.users (id) on delete set null;

create table if not exists public.contract_submit_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis_review_id uuid references public.bill_analysis_reviews (id) on delete set null,
  quote_request_id uuid references public.quote_requests (id) on delete set null,
  account_service_id uuid references public.account_services (id) on delete set null,
  service_label text not null,
  customer_name text,
  customer_email text,
  details text,
  acceptance jsonb,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_submit_actions_source_chk check (
    analysis_review_id is not null or quote_request_id is not null
  )
);

create unique index if not exists contract_submit_actions_analysis_uidx
  on public.contract_submit_actions (analysis_review_id)
  where analysis_review_id is not null;

create unique index if not exists contract_submit_actions_quote_uidx
  on public.contract_submit_actions (quote_request_id)
  where quote_request_id is not null;

create index if not exists contract_submit_actions_status_idx
  on public.contract_submit_actions (status, created_at desc);

drop trigger if exists set_contract_submit_actions_updated_at on public.contract_submit_actions;
create trigger set_contract_submit_actions_updated_at
before update on public.contract_submit_actions
for each row execute function public.set_updated_at();

alter table public.contract_submit_actions enable row level security;

drop policy if exists "contract_submit_actions_admin_all" on public.contract_submit_actions;
create policy "contract_submit_actions_admin_all"
on public.contract_submit_actions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.contract_submit_actions to authenticated;

commit;
