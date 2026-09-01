-- Implementation path + PR linkage for change queue workflow
alter table public.product_change_requests
  add column if not exists implementation_path text not null default 'spec_only',
  add column if not exists linked_branch text not null default '',
  add column if not exists linked_pr_url text not null default '',
  add column if not exists last_verification_at timestamptz,
  add column if not exists last_verification_summary text not null default '';

alter table public.product_change_requests
  drop constraint if exists product_change_requests_implementation_path_check;

alter table public.product_change_requests
  add constraint product_change_requests_implementation_path_check
  check (implementation_path in ('spec_only', 'local_unverified', 'local_verified', 'ready_for_pr'));
