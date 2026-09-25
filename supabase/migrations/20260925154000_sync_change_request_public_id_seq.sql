-- Keep CR public_id sequence ahead of any manually inserted CR-#### rows.
create or replace function public.next_product_change_public_id()
returns text
language plpgsql
as $$
declare
  next_n bigint;
  max_n bigint;
begin
  select coalesce(max((regexp_replace(public_id, '^CR-', ''))::bigint), 0)
    into max_n
  from public.product_change_requests
  where public_id ~ '^CR-[0-9]+$';

  next_n := nextval('public.product_change_request_seq');
  if next_n <= max_n then
    perform setval('public.product_change_request_seq', max_n, true);
    next_n := nextval('public.product_change_request_seq');
  end if;

  return 'CR-' || lpad(next_n::text, 4, '0');
end;
$$;
