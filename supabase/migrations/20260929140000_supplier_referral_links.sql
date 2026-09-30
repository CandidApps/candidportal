-- CR-0085: referral-link suppliers (PartnerStack etc.), click tracking and sign-up follow-up.
alter table public.solution_providers
  add column if not exists member_buy_mode text not null default 'quote',
  add column if not exists referral_url text,
  add column if not exists referral_terms_url text,
  add column if not exists referral_subid_param text;

alter table public.solution_providers
  drop constraint if exists solution_providers_member_buy_mode_check;
alter table public.solution_providers
  add constraint solution_providers_member_buy_mode_check check (member_buy_mode in ('quote', 'referral'));

comment on column public.solution_providers.member_buy_mode is
  'How members buy: quote (Candid quotes it) or referral (member orders directly through referral_url).';
comment on column public.solution_providers.referral_subid_param is
  'Query parameter the referral program uses for a sub-ID (e.g. PartnerStack); the member tracking id is appended under this name.';

create table if not exists public.member_referral_clicks (
  id uuid primary key default gen_random_uuid(),
  tracking_id text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  provider_id bigint not null references public.solution_providers (id) on delete cascade,
  clicked_at timestamptz not null default now(),
  response text check (response in ('signed_up', 'not_yet', 'no')),
  responded_at timestamptz,
  deal_external_id text,
  created_at timestamptz not null default now()
);

create index if not exists member_referral_clicks_user_idx
  on public.member_referral_clicks (user_id, clicked_at desc);
create index if not exists member_referral_clicks_provider_idx
  on public.member_referral_clicks (provider_id, clicked_at desc);

alter table public.member_referral_clicks enable row level security;

drop policy if exists "member_referral_clicks_select_own" on public.member_referral_clicks;
create policy "member_referral_clicks_select_own" on public.member_referral_clicks
  for select to authenticated using (user_id = (select auth.uid()));
