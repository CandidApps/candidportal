-- Multi-quote items: extend supplier RFQ tracking for sent emails and responses.

alter table public.quote_supplier_rfqs
  add column if not exists quote_item_id text,
  add column if not exists email_body text,
  add column if not exists responded_at timestamptz,
  add column if not exists response_source text,
  add column if not exists response_quote jsonb,
  add column if not exists response_message_id text;

alter table public.quote_supplier_rfqs drop constraint if exists quote_supplier_rfqs_status_check;

alter table public.quote_supplier_rfqs
  add constraint quote_supplier_rfqs_status_check
  check (status in ('draft', 'queued', 'sent', 'responded'));

comment on column public.quote_supplier_rfqs.quote_item_id is 'Links RFQ row to draft_quote_snapshot.quoteItems[].id';
comment on column public.quote_supplier_rfqs.response_quote is 'Detected quote document metadata from supplier reply';
