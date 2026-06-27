-- Cache the short-lived Zoho access token so we don't refresh on every request.
-- Zoho rate-limits refresh-token usage; firing several concurrent refreshes per
-- page load (calendar + email + brief + topbar) caused intermittent failures
-- that surfaced as "Connect Zoho" prompts despite a valid connection.
-- The access token is encrypted at rest (AES-256-GCM) like the refresh token.

begin;

alter table public.zoho_connections
  add column if not exists access_token_enc text,
  add column if not exists access_token_expires_at timestamptz;

commit;
