-- CR-0065: member tier flag (Basic free / Paid). No billing in this slice.
alter table public.customers
  add column if not exists member_tier text not null default 'basic';

alter table public.customers
  drop constraint if exists customers_member_tier_check;

alter table public.customers
  add constraint customers_member_tier_check check (member_tier in ('basic', 'paid'));

comment on column public.customers.member_tier is
  'Member plan tier: basic (free) or paid. Drives member cash-back share (Basic 10% / Paid 20% of supplier SPIFFs).';
