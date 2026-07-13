ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS linkedin_url text;

COMMENT ON COLUMN public.customers.linkedin_url IS 'LinkedIn company page URL';
