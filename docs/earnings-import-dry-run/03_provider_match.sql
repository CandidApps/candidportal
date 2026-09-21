-- DRY RUN helper: compare earnings_dry_run.providers to live solution_providers
select
  d.slug,
  d.name as sheet_name,
  sp.id as live_id,
  sp.name as live_name,
  case when sp.id is null then 'new_from_sheet' else 'matched' end as match_status
from earnings_dry_run.providers d
left join public.solution_providers sp on lower(sp.slug) = lower(d.slug)
order by match_status desc, d.name;
