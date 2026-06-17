-- Partner supplier registry and bank deposit tracking

begin;

create table if not exists public.partner_suppliers (
  id bigint generated always as identity primary key,
  name text not null,
  display_name text,
  supplier_key text,
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  bank_orig_co_name text,
  bank_orig_id text,
  bank_source_aliases text[] not null default '{}',
  commission_rate numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists partner_suppliers_name_key
  on public.partner_suppliers (lower(name));

create index if not exists partner_suppliers_supplier_key_idx
  on public.partner_suppliers (supplier_key)
  where supplier_key is not null;

create index if not exists partner_suppliers_orig_id_idx
  on public.partner_suppliers (bank_orig_id)
  where bank_orig_id is not null;

create table if not exists public.bank_deposit_imports (
  id bigint generated always as identity primary key,
  filename text not null,
  period_start text,
  period_end text,
  row_count int not null default 0,
  imported_at timestamptz not null default now()
);

create table if not exists public.bank_deposit_lines (
  id bigint generated always as identity primary key,
  import_id bigint not null references public.bank_deposit_imports (id) on delete cascade,
  line_index int not null,
  details text,
  posting_date text not null,
  description text not null,
  amount numeric not null,
  deposit_type text not null default 'Other',
  partner_supplier_id bigint references public.partner_suppliers (id) on delete set null,
  supplier_key text,
  source_match_label text,
  orig_co_name text,
  orig_id text,
  commission_period text,
  supplier_commission_amount numeric,
  match_status text not null default 'pending',
  variance numeric,
  created_at timestamptz not null default now()
);

create index if not exists bank_deposit_lines_import_idx
  on public.bank_deposit_lines (import_id);

create index if not exists bank_deposit_lines_period_idx
  on public.bank_deposit_lines (commission_period);

alter table public.partner_suppliers enable row level security;
alter table public.bank_deposit_imports enable row level security;
alter table public.bank_deposit_lines enable row level security;

drop policy if exists "anon_all" on public.partner_suppliers;
create policy "anon_all"
on public.partner_suppliers for all to anon using (true) with check (true);

drop policy if exists "anon_all" on public.bank_deposit_imports;
create policy "anon_all"
on public.bank_deposit_imports for all to anon using (true) with check (true);

drop policy if exists "anon_all" on public.bank_deposit_lines;
create policy "anon_all"
on public.bank_deposit_lines for all to anon using (true) with check (true);

grant select, insert, update, delete on table public.partner_suppliers to anon, authenticated, service_role;
grant select, insert, update, delete on table public.bank_deposit_imports to anon, authenticated, service_role;
grant select, insert, update, delete on table public.bank_deposit_lines to anon, authenticated, service_role;

-- Seed known commission suppliers and bank match hints
insert into public.partner_suppliers (
  name, display_name, supplier_key, bank_orig_co_name, bank_orig_id, bank_source_aliases, commission_rate
) values
  ('PaymentCloud', 'PaymentCloud', 'paymentcloud', 'PAYMENTCLOUD', '9811489501', array['PaymentCloud'], 100),
  ('AppDirect', 'AppDirect', 'appdirect', 'AppDirect Pay', '4270465600', array['AppDirect'], 100),
  ('CardConnect', 'CardConnect (Fiserv)', 'cardconnect', null, null, array['CardConnect'], 100),
  ('PayJunction', 'PayJunction', 'payjunction', 'PAYJUNCTION PMT', '1470259040', array['PayJunction'], 100),
  ('Intelisys', 'Intelisys', 'intelisys', 'Intelisys, Inc.', '2812998966', array['Intelisys'], 100),
  ('Telarus', 'Telarus', 'telarus', 'TELARUS CCD 2197', '1460490810', array['Telarus'], 100),
  ('Sandler Partners', 'Sandler Partners', 'sandlerpartners', '002889 SANDLER', '5202002889', array['Sandler Partners'], 100),
  ('Nuvei', 'Nuvei', 'nuvei', 'NUVEI', '1481298435', array['Nuvei'], 100),
  ('CheckCommerce', 'CheckCommerce', 'checkcommerce', 'CG Reseller Comm', '0000100013', array['CheckCommerce'], 100),
  ('Vendara', 'Vendara', 'vendara', 'GLOBAL PAYMENTS', '2132749397', array['Vendara'], 100),
  ('Mango', 'Mango Voice', 'mango', 'MANGO VOICE, LLC', '9200502235', array['Mango'], 100),
  ('Weave', 'Weave', 'weave', 'WEAVE COMMUNICAT', '7263302902', array['Weave'], 100),
  ('TekPartners', 'TekSystems', null, null, null, array['TekPartners', 'Tek Partners', 'TekSystems'], 100),
  ('CorpIT', 'CorpIT', null, null, null, array['CorpIT', 'Corporate IT Dept.'], 100),
  ('Linked2Pay', 'Linked2Pay', null, 'linked2pay Bill', 'P113794679', array['Linked2Pay'], 100),
  ('Candid', 'Candid Solutions', null, null, null, array['Candid'], null);

commit;
