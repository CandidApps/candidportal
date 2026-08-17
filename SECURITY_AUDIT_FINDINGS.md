# Security Audit Findings — File Handling, Crypto, Email, Storage

**Date:** 2026-08-04
**Scope:** File upload/download, cryptography, email, OAuth, Supabase storage

> Excludes known issues: HTML injection in meeting booking emails, email HTML XSS
> via dangerouslySetInnerHTML, stored XSS via @mentions in team notes.

---

## Finding 1: SVG Upload Enables Stored XSS via Public Storage URL

**Severity:** High
**Files:**
- `src/app/api/admin/solution-providers/logo/route.ts` (lines 11, 102–113)
- `supabase/migrations/20260715210004_solution_provider_logo.sql`

**Description:**
The supplier logo upload endpoint allows `image/svg+xml` uploads (line 11). SVG files
can contain embedded JavaScript (e.g., `<svg onload="alert(document.cookie)">`). The
uploaded file is stored in the `app` bucket and its public URL is persisted as the
supplier's `logo_url` (line 113). This URL is then rendered across admin and portal
views wherever supplier logos appear.

**Attack path:**
1. An admin uploads a malicious SVG file as a supplier logo.
2. The SVG is stored in the `app` bucket and a public URL is generated.
3. When any user (admin or portal member) views a page that renders the supplier logo
   as an `<img>` tag, the browser may not execute the script (img tags sandbox SVG).
   However, if the public URL is opened directly (e.g., right-click → open image in
   new tab, or if the logo is rendered via `<object>`, `<embed>`, or `<iframe>`),
   the embedded JavaScript executes in the context of the Supabase storage domain.
4. If the storage domain shares the application origin (e.g., same-origin due to proxy
   config), cookies and tokens can be stolen.

**Impact:** Stored XSS when SVG is opened directly. Session hijacking if storage
shares origin with the application. Even cross-origin, the SVG can phish users or
redirect them to malicious sites.

**Recommendation:** Remove `image/svg+xml` from the allowed MIME types for logo
uploads. If SVG support is required, sanitize SVGs server-side (strip `<script>`,
event handlers, `<foreignObject>`, etc.) or serve them with
`Content-Disposition: attachment` and `Content-Type: application/octet-stream`.

---

## Finding 2: Meeting Attachment Upload Has No Application-Level File Type Validation

**Severity:** Medium
**Files:**
- `src/app/api/admin/meeting-settings/attachment/route.ts` (lines 30–46)
- `supabase/migrations/0047_admin_meeting_settings.sql` (lines 16–46)

**Description:**
The meeting attachment upload endpoint performs no file type validation at the
application layer. It accepts any file and passes the client-supplied `file.type`
directly as the `contentType` to Supabase storage (line 41). While the Supabase
bucket has `allowed_mime_types` configured, the bucket-level check trusts the
Content-Type header sent by the upload, which is the client-supplied MIME type —
not magic-byte validation. An attacker could upload an HTML file with
`Content-Type: text/plain` to bypass the bucket filter, or the bucket filter
could be loosened in the future without anyone realizing the API has no validation.

More critically, the `meeting-attachments` bucket is **public** (line 22 of the
migration), with a read policy open to `public` (unauthenticated, line 45). This
means any uploaded file is world-readable without authentication. Combined with
no file type validation, this creates a publicly accessible file hosting service
controlled by admin accounts.

**Attack path:**
1. A compromised admin account uploads a malicious HTML/JS file as a meeting
   attachment (the bucket allows `text/plain` which may be reinterpreted).
2. The public URL is returned and is accessible by anyone on the internet without
   authentication.
3. The URL can be used for phishing, malware hosting, or watering hole attacks
   hosted on the application's trusted domain.

**Impact:** Publicly accessible unrestricted file hosting on the application's
domain. Reputational damage if used for phishing/malware distribution.

**Recommendation:**
- Add application-level MIME type validation matching the bucket's allowed types.
- Add a file size check at the application level.
- Evaluate whether the bucket truly needs to be public; consider serving
  attachments through a signed-URL proxy endpoint instead.

---

## Finding 3: Open Redirect in Portal Contract File Download

**Severity:** Medium
**Files:**
- `src/app/api/portal/contracts/[id]/file/route.ts` (lines 49–53)

**Description:**
When a contract has no stored file (`contract_storage_path` is empty) but has a
`contract_url`, the endpoint redirects the authenticated portal user to that URL
without any validation of the destination domain:

```typescript
const raw = action.contract_url?.trim();
if (raw) {
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return NextResponse.redirect(href);
}
```

The `contract_url` field is set by admins via the contract-submit-actions API
(line 403 of `src/app/api/admin/contract-submit-actions/route.ts`), which accepts
arbitrary URLs from admin users without domain validation.

**Attack path:**
1. An admin (or a compromised admin account, or via IDOR if contract-submit-actions
   has authorization gaps) sets `contractUrl` to `https://evil.com/phishing-page`
   on a contract action.
2. A portal member clicks the "View Contract" link, which hits
   `/api/portal/contracts/{id}/file`.
3. The user is redirected to `https://evil.com/phishing-page`. The redirect comes
   from the trusted application domain, so the user trusts the destination.
4. The phishing page mimics the application login or contract signing page to
   harvest credentials.

**Impact:** Phishing attacks leveraging the trusted application domain for redirects.
Portal members would see a redirect from the legitimate application URL.

**Recommendation:** Validate `contract_url` against an allowlist of trusted domains
before redirecting. Alternatively, display an interstitial warning page for external
links instead of issuing a direct redirect.

---

## Finding 4: CRM Document Upload Has No File Type or Size Validation

**Severity:** Medium
**Files:**
- `src/app/api/admin/crm/documents/route.ts` (lines 36–51)
- `src/lib/crm/upload-customer-document-file.ts` (lines 14–33)

**Description:**
The CRM document upload endpoint checks that a file is present and non-empty
(line 36) but performs no validation on file type or size at the application
level. The `uploadCustomerDocumentFile` function uses `resolveUploadContentType`
to determine the content type, but this function only picks a MIME type — it does
not reject any file types.

The `candid_documents` bucket has `allowed_mime_types` configured in the migration
(limited to PDF, Office, image, CSV), but these checks rely on the Content-Type
header provided during upload. If the application code sends a non-matching
Content-Type, the bucket may reject it. However, there is no explicit application-
level file size limit — the bucket has a 50MB limit but no code-level enforcement.

Without application-level validation, defense-in-depth is weakened: if the bucket
configuration changes or is misconfigured, arbitrary files could be uploaded.

**Impact:** Potential for large file denial-of-service (up to 50MB per upload with
no rate limiting visible in the code). Reduced defense-in-depth against arbitrary
file type uploads.

**Recommendation:** Add explicit file type validation (allowlist) and file size
limits in the API route handler before uploading to storage.

---

## Finding 5: Customer Message Attachments Uploaded to Shared Bucket Without Type Validation

**Severity:** Medium
**Files:**
- `src/lib/customer-message-attachments.ts` (lines 3, 41–64)
- `src/app/api/portal/message-center/route.ts` (lines 102–106)
- `src/app/api/customer-messages/attachment/route.ts` (lines 27–31)

**Description:**
Customer message attachments are uploaded by portal members (authenticated but
non-admin users) into the `service-bills` bucket (line 3 of
`customer-message-attachments.ts`). The upload function
`uploadCustomerMessageAttachments` accepts any file with no type or size validation
(lines 47–63). It uses the client-supplied `entry.type` as `contentType`.

The `service-bills` bucket's RLS policies scope file access to the uploading user's
folder (`(storage.foldername(name))[1] = auth.uid()`). The upload path uses
`messages/${ownerUserId}/…`, which means the path structure is consistent with the
RLS policy. However, the lack of file type validation means portal members can
upload any file type (executable, HTML, etc.) into the bucket.

Additionally, the download endpoint (`src/app/api/customer-messages/attachment/route.ts`)
serves files with `Content-Disposition: inline` (line 63), meaning the browser will
attempt to render the content. If an HTML file is uploaded and then downloaded via the
API, it could execute in the application's origin context.

**Attack path:**
1. A portal member uploads an HTML file with embedded JavaScript as a message
   attachment via the message center.
2. An admin views the message thread and clicks the attachment link.
3. The attachment is served inline from the application's own origin
   (`/api/customer-messages/attachment?path=…`) with `Content-Type: text/html`
   (since the client-supplied type is used).
4. The malicious HTML/JS executes in the admin's browser in the application's
   origin, with access to admin cookies and session tokens.

**Impact:** Stored XSS targeting admin users. A portal member can craft an
attachment that steals admin session tokens when an admin views it.

**Recommendation:**
- Add file type validation (allowlist) in `uploadCustomerMessageAttachments`.
- Serve downloaded attachments with `Content-Disposition: attachment` instead of
  `inline` to prevent browser rendering.
- Set `X-Content-Type-Options: nosniff` on download responses.
- Consider serving user-uploaded content from a separate domain/origin.

---

## Finding 6: Content-Disposition Header Injection via Unsanitized Filenames

**Severity:** Low
**Files:**
- `src/app/api/admin/quote-requests/[id]/proposal/route.ts` (line 97)

**Description:**
The proposal download endpoint constructs the `Content-Disposition` header using
the filename derived from the storage path without sanitizing double-quote
characters:

```typescript
'Content-Disposition': `inline; filename="${filename}"`,
```

All other download endpoints in the codebase strip double quotes from filenames
(e.g., `filename.replace(/"/g, '')`), but this endpoint does not. While the
filename comes from a storage path that was sanitized on upload via `safeSegment`
(which strips most special characters), a direct database manipulation or future
code change could introduce filenames containing quotes or newlines.

**Impact:** Low. The filename source is already sanitized by `safeSegment` during
upload, limiting practical exploitability. However, this is an inconsistency that
weakens defense-in-depth.

**Recommendation:** Add `.replace(/"/g, '')` to the filename in the
Content-Disposition header for consistency with other endpoints.

---

## Finding 7: Missing Supabase Storage Bucket Configuration for `app` Bucket

**Severity:** Low
**Files:**
- `src/app/api/admin/solution-providers/logo/route.ts` (line 9)
- `supabase/migrations/20260715210004_solution_provider_logo.sql`

**Description:**
The logo upload endpoint uses a bucket named `app` (line 9), but no migration
file creates this bucket with `insert into storage.buckets`. The migration at
`20260715210004_solution_provider_logo.sql` only adds columns to the
`solution_providers` table and does not configure storage bucket settings,
RLS policies, `allowed_mime_types`, or `file_size_limit` for the `app` bucket.

If the `app` bucket was created manually (outside migrations) or by the
application at runtime, its security configuration is not tracked in version
control. This means:
- No guaranteed RLS policies restrict who can read/write/delete objects.
- No `allowed_mime_types` constraint at the bucket level (the API-level check
  could be bypassed if the bucket accepts anything).
- No `file_size_limit` at the bucket level.
- The bucket's public/private setting is unknown and unversioned.

**Impact:** If the bucket is public (or misconfigured), uploaded logos (including
malicious SVGs per Finding 1) are accessible without authentication. Without
versioned bucket configuration, security properties cannot be audited or reliably
reproduced across environments.

**Recommendation:** Add a migration that creates the `app` bucket with explicit
`public`, `file_size_limit`, `allowed_mime_types`, and RLS policies. Track all
bucket configurations in migrations.

---

## Summary

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| 1 | SVG upload enables stored XSS via public storage URL | High | File Upload |
| 2 | Meeting attachment upload has no file type validation + public bucket | Medium | File Upload / Storage |
| 3 | Open redirect in portal contract file download | Medium | Redirect |
| 4 | CRM document upload has no file type/size validation | Medium | File Upload |
| 5 | Customer message attachments — stored XSS via inline HTML serving | Medium | File Upload / XSS |
| 6 | Content-Disposition header injection (inconsistent sanitization) | Low | File Download |
| 7 | Missing bucket configuration for `app` bucket | Low | Storage Config |
