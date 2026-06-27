-- Admin-created customer quotes (TASK-025).
create table if not exists public.customer_quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  type text,
  provider text,
  method text not null default 'pricing',
  status text not null default 'draft',
  note text,
  file_storage_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_quotes_customer_id_idx on public.customer_quotes (customer_id);
create index if not exists customer_quotes_status_idx on public.customer_quotes (status);

alter table public.customer_quotes enable row level security;

-- Admin-only access is enforced server-side via the service-role client; no
-- public policies are added so the anon/auth roles cannot read these rows.
