-- Member onboarding flags (welcome modal, analysis unlock) were in 0005 locally
-- but never applied on production; member portal code expects these columns.

alter table public.profiles
  add column if not exists welcome_seen_at timestamptz,
  add column if not exists analysis_unlocked_at timestamptz;

comment on column public.profiles.welcome_seen_at is
  'When the member dismissed the first-login welcome modal.';
comment on column public.profiles.analysis_unlocked_at is
  'When the member unlocked full analysis (e.g. one-time payment).';
