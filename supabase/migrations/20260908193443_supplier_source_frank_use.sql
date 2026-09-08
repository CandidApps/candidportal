-- How Frank should treat each supplier reference link (CR-0002).

begin;

alter table public.solution_provider_sources
  add column if not exists frank_use text not null default 'fetch';

alter table public.solution_provider_sources
  drop constraint if exists solution_provider_sources_frank_use_check;

alter table public.solution_provider_sources
  add constraint solution_provider_sources_frank_use_check
  check (frank_use in ('cite', 'fetch', 'ignore'));

comment on column public.solution_provider_sources.frank_use is
  'cite = list URL only; fetch = Frank may read page content; ignore = omit from Frank context';

commit;
