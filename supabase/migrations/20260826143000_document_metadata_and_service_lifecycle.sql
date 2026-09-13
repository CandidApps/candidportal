-- Document metadata fields + custom "Other" type labels per customer.

ALTER TABLE public.customer_records
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS is_candid_agreement boolean,
  ADD COLUMN IF NOT EXISTS document_service_status text,
  ADD COLUMN IF NOT EXISTS previous_provider text,
  ADD COLUMN IF NOT EXISTS previous_mrc numeric,
  ADD COLUMN IF NOT EXISTS candid_mrc numeric,
  ADD COLUMN IF NOT EXISTS other_document_kind text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS document_other_type_labels jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.customers.document_other_type_labels IS
  'Distinct labels used when document type is Other — offered as suggestions on next upload.';

-- Service lifecycle for previous Candid services (separate admin action moves services here).
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS service_lifecycle text NOT NULL DEFAULT 'active';

COMMENT ON COLUMN public.deals.service_lifecycle IS
  'active | previous — previous tier on member My Services; set by lifecycle action not document status.';
