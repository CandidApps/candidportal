-- Bank deposits arrive ~1 month after the commission period they pay out.
-- commission_period was previously set to the posting month; shift forward by one month.

update public.bank_deposit_lines
set commission_period = to_char(
  (commission_period || '-01')::date + interval '1 month',
  'YYYY-MM'
)
where commission_period is not null
  and commission_period ~ '^\d{4}-\d{2}$';
