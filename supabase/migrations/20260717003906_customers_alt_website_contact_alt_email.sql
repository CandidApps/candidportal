-- Alternate company website / domain and alternate contact email for dual-domain accounts.
alter table public.customers
  add column if not exists alt_website text;

alter table public.customer_contacts
  add column if not exists alt_email text;
