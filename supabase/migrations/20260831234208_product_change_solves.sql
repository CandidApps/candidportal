alter table public.product_change_requests
  add column if not exists change_solves text not null default '';
