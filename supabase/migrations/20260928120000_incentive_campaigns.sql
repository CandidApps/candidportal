-- CR-0064: one campaign table for supplier SPIFFs and Candid promos (source tag is the only difference).
-- Replaces display-only solution_providers.member_promos as the source of truth for Find Solutions promos.

create table if not exists public.incentive_campaigns (
  id uuid primary key default gen_random_uuid(),
  provider_id bigint not null references public.solution_providers (id) on delete cascade,
  source text not null check (source in ('supplier_spiff', 'candid_promo')),
  title text not null,
  details text,
  structure_type text check (structure_type in ('percent', 'dollar', 'multiplier')),
  structure_value numeric,
  starts_on date,
  ends_on date,
  ended_early_at timestamptz,
  customer_facing text not null default 'review' check (customer_facing in ('yes', 'review', 'no')),
  cta_label text,
  banner_image_path text,
  banner_image_url text,
  show_in_slider boolean not null default false,
  slide_order integer not null default 0,
  legacy_member_promo_id text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incentive_campaigns_provider_idx on public.incentive_campaigns (provider_id);
create index if not exists incentive_campaigns_slider_idx
  on public.incentive_campaigns (slide_order)
  where show_in_slider and customer_facing = 'yes' and ended_early_at is null;
create unique index if not exists incentive_campaigns_legacy_promo_uidx
  on public.incentive_campaigns (provider_id, legacy_member_promo_id)
  where legacy_member_promo_id is not null;

alter table public.incentive_campaigns enable row level security;

comment on table public.incentive_campaigns is
  'Supplier SPIFFs and Candid promos. Only customer_facing = yes, inside starts_on/ends_on and not ended early, are shown to members. Accessed via server routes (service role).';

insert into public.incentive_campaigns (
  provider_id, source, title, details, ends_on, customer_facing, legacy_member_promo_id
)
select
  sp.id,
  'supplier_spiff',
  left(trim(promo ->> 'title'), 120),
  nullif(trim(coalesce(promo ->> 'details', '')), ''),
  case when (promo ->> 'expiresOn') ~ '^\d{4}-\d{2}-\d{2}$' then (promo ->> 'expiresOn')::date end,
  'yes',
  coalesce(nullif(promo ->> 'id', ''), 'promo-' || ord::text)
from public.solution_providers sp
cross join lateral jsonb_array_elements(sp.member_promos) with ordinality as p(promo, ord)
where jsonb_typeof(promo) = 'object'
  and coalesce(trim(promo ->> 'title'), '') <> ''
on conflict do nothing;

comment on column public.solution_providers.member_promos is
  'Deprecated (CR-0064): promos now live in incentive_campaigns. Kept for rollback only; no longer read by the app.';
