-- CR-0014: Member Earnings Profile on solution providers.
-- Mapping: member_cashback_pct > 0 → one rebate % line, duration indefinitely.
-- Null / ≤ 0 → None (leave profile null).

alter table public.solution_providers
  add column if not exists member_earnings_profile jsonb;

comment on column public.solution_providers.member_earnings_profile is
  'Member earnings profile (discount/rebate lines, AND/OR, durations). Null or empty lines = None. Source of truth for member copy and self-agent residual %. Traditional partner agent rates are unchanged.';

update public.solution_providers
set member_earnings_profile = jsonb_build_object(
  'combinator', 'and',
  'lines', jsonb_build_array(
    jsonb_build_object(
      'id', 'migrated-cashback',
      'kind', 'rebate',
      'amount', member_cashback_pct,
      'amountType', 'percent',
      'duration', jsonb_build_object('type', 'indefinitely')
    )
  )
)
where member_cashback_pct is not null
  and member_cashback_pct > 0
  and member_earnings_profile is null;
