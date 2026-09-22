-- Tags for grouping related change requests in the Change queue.
alter table public.product_change_requests
  add column if not exists tags text[] not null default '{}';

comment on column public.product_change_requests.tags is
  'Freeform tags for grouping related change requests in the Change queue.';

create index if not exists product_change_requests_tags_gin
  on public.product_change_requests using gin (tags);
