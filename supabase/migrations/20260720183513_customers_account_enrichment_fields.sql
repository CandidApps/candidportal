-- Account enrichment profile fields (firmographics / social / tech stack).
alter table public.customers
  add column if not exists founded_year text,
  add column if not exists employee_count text,
  add column if not exists main_phone text,
  add column if not exists ceo_principal text,
  add column if not exists annual_revenue text,
  add column if not exists funding_ownership_type text,
  add column if not exists parent_company text,
  add column if not exists public_location_count text,
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists twitter_url text,
  add column if not exists youtube_url text,
  add column if not exists google_business_url text,
  add column if not exists technologies text;
