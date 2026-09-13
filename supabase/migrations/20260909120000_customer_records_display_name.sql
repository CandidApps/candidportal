-- Friendly document label for admin/member UI (CR-0012).
-- Does not rename storage paths; filename stays the original upload name.

ALTER TABLE public.customer_records
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN public.customer_records.display_name IS
  'Friendly label shown in admin/member UI; storage filename remains in filename.';
