-- Persist imported supplier contract files (attachments) for shareable serving.
alter table public.contract_submit_actions
  add column if not exists contract_storage_path text;

comment on column public.contract_submit_actions.contract_url is
  'External signing/view URL, or app share URL for an imported attachment.';
comment on column public.contract_submit_actions.contract_storage_path is
  'Supabase Storage path in candid_documents when a supplier attachment was imported.';
