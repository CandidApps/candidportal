-- Read-only SQL helpers for admin Hank chat (service_role only).

begin;

create or replace function public.hank_admin_read_query(query_text text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  result jsonb;
begin
  normalized := trim(both from query_text);
  if normalized = '' then
    raise exception 'Query is empty';
  end if;

  if right(normalized, 1) = ';' then
    normalized := left(normalized, length(normalized) - 1);
  end if;

  if normalized !~* '^\s*select' then
    raise exception 'Only SELECT queries are allowed';
  end if;

  if normalized ~* '\m(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|execute|call|do|set|begin|commit|rollback|into|pg_sleep|pg_read_file|lo_import|lo_export)\M' then
    raise exception 'Query contains disallowed keywords';
  end if;

  if position(';' in normalized) > 0 then
    raise exception 'Multiple statements are not allowed';
  end if;

  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) from (select * from (%s) sub limit 500) t',
    normalized
  ) into result;

  return result;
end;
$$;

create or replace function public.hank_admin_list_tables()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'table_name', t.table_name,
        'column_count', (
          select count(*)::int
          from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = t.table_name
        )
      )
      order by t.table_name
    ),
    '[]'::jsonb
  )
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE';
$$;

create or replace function public.hank_admin_describe_table(table_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  safe_name text;
  result jsonb;
begin
  safe_name := trim(both from table_name);
  if safe_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' then
    raise exception 'Invalid table name';
  end if;

  if not exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and t.table_name = safe_name
  ) then
    raise exception 'Table not found: %', safe_name;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'column_name', c.column_name,
        'data_type', c.data_type,
        'is_nullable', c.is_nullable
      )
      order by c.ordinal_position
    ),
    '[]'::jsonb
  )
  into result
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = safe_name;

  return result;
end;
$$;

revoke all on function public.hank_admin_read_query(text) from public;
revoke all on function public.hank_admin_list_tables() from public;
revoke all on function public.hank_admin_describe_table(text) from public;

grant execute on function public.hank_admin_read_query(text) to service_role;
grant execute on function public.hank_admin_list_tables() to service_role;
grant execute on function public.hank_admin_describe_table(text) to service_role;

commit;
