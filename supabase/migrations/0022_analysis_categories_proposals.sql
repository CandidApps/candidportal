-- Multi-category analysis reviews and customer proposal documents

alter table public.bill_analysis_reviews
  add column if not exists detected_categories text[] default null;

update public.bill_analysis_reviews
set detected_categories = array[detected_category]
where detected_categories is null and detected_category is not null;

alter table public.account_services
  add column if not exists analysis_snapshot jsonb default null;
