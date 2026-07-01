-- Quote requests: admin Action Center visibility + New Quote flow fields

begin;

alter table public.quote_requests
  add column if not exists service_type_id text,
  add column if not exists service_answers jsonb,
  add column if not exists vendor_names text[],
  add column if not exists location jsonb,
  add column if not exists subject text;

update public.quote_requests set status = 'open' where status = 'submitted';

alter table public.quote_requests
  alter column status set default 'open';

alter table public.quote_requests drop constraint if exists quote_requests_status_check;
alter table public.quote_requests add constraint quote_requests_status_check
  check (status in ('open', 'in_progress', 'resolved', 'submitted'));

drop trigger if exists set_quote_requests_updated_at on public.quote_requests;
create trigger set_quote_requests_updated_at
before update on public.quote_requests
for each row execute function public.set_updated_at();

drop policy if exists "quote_requests owner read" on public.quote_requests;
create policy "quote_requests_select"
on public.quote_requests for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "quote_requests owner insert" on public.quote_requests;
create policy "quote_requests_insert_own"
on public.quote_requests for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "quote_requests_admin_update" on public.quote_requests;
create policy "quote_requests_admin_update"
on public.quote_requests for update to authenticated
using (public.is_admin()) with check (public.is_admin());

grant update on table public.quote_requests to authenticated;

commit;
