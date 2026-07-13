-- Baseline savings from published analysis + seats added after switching to Candid.

begin;

alter table public.account_services
  add column if not exists savings_baseline jsonb,
  add column if not exists added_seat_count integer not null default 0;

comment on column public.account_services.savings_baseline is
  'Frozen original proposed savings and old-provider seat economics from published analysis.';
comment on column public.account_services.added_seat_count is
  'Seats/licenses/extensions added after the original analysis (for adjusted savings vs old provider).';

commit;
