# Security Audit Report — CandidPortal API Endpoints

**Date:** 2026-08-07
**Scope:** 15 API route files + 3 auth/infrastructure modules
**Branch:** `cursor/at-rest-security-review-6368`

---

## Table of Contents

1. [Authentication & Authorization Infrastructure](#1-authentication--authorization-infrastructure)
2. [Endpoint-by-Endpoint Findings](#2-endpoint-by-endpoint-findings)
3. [Cross-Cutting Concerns](#3-cross-cutting-concerns)
4. [Summary of Findings by Severity](#4-summary-of-findings-by-severity)
5. [Recommendations](#5-recommendations)

---

## 1. Authentication & Authorization Infrastructure

### `src/lib/auth/roles.ts` — Role Resolution

| Check | Status |
|---|---|
| Uses `supabase.auth.getUser()` (server-side, JWT-verified) | ✅ Good |
| Profile role loaded via service-role client (bypasses RLS) | ✅ Good |
| Unauthenticated users default to `"user"` (not admin) | ✅ Good |

**Finding AUTH-1 (Medium): Domain-based admin fallback**
- **File:** `src/lib/auth/admin-email.ts`, lines 2–6; `src/lib/auth/roles.ts`, line 39
- **Issue:** When the profiles table is unavailable or the admin client errors, `getMyRole()` falls back to `isCandidAdminEmail(email)`, granting admin access to **any** `@candid.solutions` email. If an attacker registers a Supabase Auth account with a `@candid.solutions` email (if email verification is not strictly enforced, or if email providers allow alias tricks), they gain full admin access.
- **Severity:** Medium — depends on whether Supabase Auth enforces email verification and whether the `candid.solutions` domain has strict SPF/DKIM preventing impersonation.
- **Recommendation:** Ensure email verification is mandatory in Supabase Auth settings. Consider requiring profile-based role assignment as the sole authority (remove the domain-fallback path) once profiles are stable.

**Finding AUTH-2 (Low): Agent role has marketing hub access**
- **File:** `src/lib/auth/staff.ts`, lines 3–5
- `canAccessMarketingHub()` returns `true` for both `admin` and `agent` roles, while `canManageMarketingHub()` correctly restricts to `admin` only. The `agent` role is mentioned in `resolveAppRoleFromEmail` but its capabilities are not well-documented across the app — verify that `agent`-level users should indeed have read access to marketing assets.

### `src/lib/supabase/admin.ts` — Admin Client

| Check | Status |
|---|---|
| Uses `SUPABASE_SERVICE_ROLE_KEY` | ✅ Expected |
| `persistSession: false, autoRefreshToken: false` | ✅ Good (server-only) |
| No key leakage to client | ✅ Good (server module only) |

No issues found in the admin client itself. The service-role client bypasses RLS, which is intentional but means all authorization must be enforced at the API route level.

---

## 2. Endpoint-by-Endpoint Findings

### 2.1 CRM Import — `src/app/api/admin/crm/import/route.ts`

| Check | Status |
|---|---|
| Auth: `getMyRole() !== 'admin'` | ✅ Enforced |
| Input validation | ⚠️ Partial |
| SQL injection | ✅ Protected (Supabase client parameterizes) |

**Finding CRM-IMPORT-1 (Medium): No schema validation on import payload**
- **Lines 17, 31–35:** The body is cast with `as ImportBody` but individual array elements within `customers`, `locations`, and `contacts` are not validated. A malicious admin could inject unexpected fields into DB rows via the spread patterns in `persistCrmBulkImport()` (file: `src/lib/crm/persist.ts`, line 55). The Supabase `upsert` call will silently ignore unknown columns, but if column names ever align with attacker-controlled keys, data corruption is possible.
- **Recommendation:** Add runtime schema validation (Zod) on the import payload to restrict accepted fields.

**Finding CRM-IMPORT-2 (Low): No import size limits**
- **Lines 22–28:** Validates that arrays exist but does not cap their length. An admin could POST thousands of records in a single request, potentially causing timeouts or memory exhaustion.
- **Recommendation:** Cap array lengths (e.g., 5,000 per array) and document the limits.

---

### 2.2 Customer Merge — `src/app/api/admin/crm/customers/merge/route.ts`

| Check | Status |
|---|---|
| Auth: `getMyRole() !== 'admin'` | ✅ Enforced |
| Input validation | ✅ IDs trimmed and checked |
| Self-merge prevention | ✅ (in `merge-customers.ts` line 68) |

**Finding MERGE-1 (Medium): No transactional guarantee / race condition**
- **File:** `src/lib/crm/merge-customers.ts`, lines 59–373
- The merge operation performs 20+ sequential DB mutations (move locations, contacts, deals, records, update references, archive source) without a database transaction. If any step fails mid-way, the data is left in a partially merged state with no rollback mechanism.
- **Severity:** Medium — data integrity risk. Two concurrent merge requests involving the same source account could cause duplicate moves or lost data.
- **Recommendation:** Wrap the merge in a Supabase RPC call (`supabase.rpc()`) backed by a server-side PostgreSQL function with `BEGIN ... COMMIT`, or use advisory locks to serialize merge operations on the same accounts.

**Finding MERGE-2 (Low): Merge result exposes internal UUIDs**
- **Line 37:** The response includes `...result` which contains internal external IDs and counts. This is admin-only so low risk, but consider returning only what the UI needs.

---

### 2.3 Repair Deal Locations — `src/app/api/admin/crm/customers/repair-deal-locations/route.ts`

| Check | Status |
|---|---|
| Auth: `getMyRole() !== 'admin'` | ✅ Enforced |
| Input validation | ✅ `customerId` trimmed and checked |

No significant vulnerabilities found. The endpoint delegates to a well-scoped repair function.

---

### 2.4 Email Send — `src/app/api/admin/email/send/route.ts`

| Check | Status |
|---|---|
| Auth: `canAccessMarketingHub()` (admin or agent) | ✅ Enforced |
| Secondary user check | ✅ `supabase.auth.getUser()` |
| Recipient validation | ⚠️ Minimal |

**Finding EMAIL-1 (High): No email address validation — potential for abuse**
- **Line 34:** The `to` field is only checked for non-empty after `.trim()`. No validation that it's a valid email address. The `cc` and `bcc` fields (lines 71–72) are passed directly to Zoho with only `.trim()`.
- **Risk:** An agent-role user could send emails to any address (spam relay), inject multiple addresses via comma-separated values, or potentially inject email header content depending on how `sendMail` constructs the Zoho API request.
- **Recommendation:** Validate all email fields with a proper email regex. Consider rate limiting and/or an allowlist of recipient domains for non-admin users.

**Finding EMAIL-2 (Medium): HTML content passed unvalidated**
- **Line 37:** `body.html` is sent as email body without sanitization. While this is intentional for marketing emails, an agent-role user could craft phishing content.
- **Recommendation:** Consider HTML sanitization or at minimum logging/auditing of sent emails for agent-role users.

**Finding EMAIL-3 (Low): Email sent "from" connection.email without verification**
- **Line 69:** The `fromAddress` is the connected Zoho mailbox address. This is appropriate but ensure the Zoho connection is validated server-side and not spoofable.

---

### 2.5 Marketing Hub — `src/app/api/admin/marketing-hub/route.ts`

| Check | Status |
|---|---|
| Auth (GET): `canAccessMarketingHub()` | ✅ |
| Auth (POST/DELETE/PATCH): `canManageMarketingHub()` | ✅ |
| File upload validation | ⚠️ Partial |

**Finding MKT-1 (Medium): No file size limit on marketing asset upload**
- **Line 162:** Checks that file exists and has non-zero size, but no upper bound. An attacker with admin access could upload extremely large files to exhaust storage.
- **Recommendation:** Add a `MAX_FILE_SIZE` constant (e.g., 50MB) and reject files exceeding it.

**Finding MKT-2 (Medium): No file type restriction on upload**
- **Lines 162–185:** Any file type is accepted. The `mimeType` is derived from `file.type` (client-provided, easily spoofed) or from filename extension. Executable files (.exe, .sh, .js) could be uploaded.
- **Recommendation:** Add an allowlist of permitted MIME types/extensions for marketing assets.

**Finding MKT-3 (Low): SVG upload enables stored XSS vector**
- **Line 31:** The MIME map includes `image/svg+xml`. SVG files can contain embedded JavaScript. When served inline via `serveAsset()` (line 138, disposition `inline`), the browser may execute the embedded script.
- **Recommendation:** Either strip SVGs of script content on upload, serve SVGs with `Content-Disposition: attachment`, or add `Content-Security-Policy: sandbox` header when serving SVGs.

**Finding MKT-4 (Low): Storage path sanitization is adequate**
- **Lines 71–73, 183:** `safeStorageSegment()` and `path.basename()` plus regex replacement prevent path traversal. ✅ Good.

---

### 2.6 PDF Conversion — `src/app/api/admin/marketing-hub/convert-pdf/route.ts`

| Check | Status |
|---|---|
| Auth: `canManageMarketingHub()` | ✅ |
| Input: validates asset exists and is PDF | ✅ |

**Finding PDF-1 (Low): PDF parsing may be vulnerable to crafted PDFs**
- **Line 92:** `convertPdfBufferToEmailHtml(buffer, source.filename)` processes arbitrary PDF content. Depending on the PDF parsing library, crafted PDFs could cause DoS (infinite loops, memory exhaustion) or potentially code execution.
- **Recommendation:** Run PDF conversion in a sandboxed environment or with resource limits. Validate the PDF library is up-to-date and not known-vulnerable.

---

### 2.7 Leads Management — `src/app/api/admin/leads/route.ts`

| Check | Status |
|---|---|
| Auth (GET/POST): `getMyRole() !== 'admin'` | ✅ |
| Input validation | ⚠️ Partial |

**Finding LEADS-1 (Low): `lead_data` JSONB is a passthrough**
- **Lines 96–105, 114:** The entire `incoming` Lead object is spread into `leadData` and stored as `lead_data` JSONB. No validation of nested structure. An admin could store arbitrary JSON that may confuse downstream consumers.
- **Recommendation:** Validate the Lead shape with a runtime schema.

**Finding LEADS-2 (Low): `existingRowId` update path lacks ownership verification beyond admin check**
- **Lines 107–125:** When `portalLeadRowId` is provided, the code updates the matching row. Since only admins reach this code, and the row ID comes from the admin user, this is acceptable but could be tightened by verifying the row exists before updating.

---

### 2.8 Lead by ID — `src/app/api/admin/leads/[id]/route.ts`

| Check | Status |
|---|---|
| Auth: `getMyRole() !== 'admin'` | ✅ |
| Route param usage | ✅ From Next.js params |

**Finding LEAD-ID-1 (Low): Full `lead_data` JSONB overwrite**
- **Line 56–57:** If `body.leadData` is provided, it replaces the entire `lead_data` column with no merge. An admin could accidentally wipe lead data by sending a partial object.
- **Recommendation:** Consider deep-merge or require explicit fields rather than full-object replacement.

---

### 2.9 Lead Documents — `src/app/api/admin/leads/[id]/documents/route.ts`

| Check | Status |
|---|---|
| Auth (GET/POST): `getMyRole() !== 'admin'` | ✅ |
| File upload | ⚠️ See findings |
| Path traversal | ✅ `safeSegment()` used on all path components |

**Finding LDOC-1 (Medium): No file size limit**
- **Line 92:** Checks `file.size <= 0` but has no upper bound. Admins can upload arbitrarily large files.
- **Recommendation:** Add a maximum file size check.

**Finding LDOC-2 (Medium): No file type restriction**
- **Lines 90–94:** Any file type is accepted. Consider restricting to document types relevant to leads.

**Finding LDOC-3 (Low): `upsert: true` could overwrite existing files**
- **Line 127:** Storage upload uses `upsert: true`, meaning a crafted filename collision (unlikely given UUID-based paths) could overwrite an existing file.

---

### 2.10 Run Analysis — `src/app/api/admin/leads/[id]/run-analysis/route.ts`

| Check | Status |
|---|---|
| Auth: `getMyRole() !== 'admin'` + user check | ✅ |
| Document kind validation | ✅ Lines 66–71 |
| Duplicate analysis guard | ✅ Lines 73–81 |

**Finding ANALYSIS-1 (Low): `parseResult` passthrough to DB**
- **Lines 44, 97:** The `body.parseResult` is passed to `finalizeBillParseResult()` and then stored in the DB. No validation that the parse result conforms to the expected schema. An admin could inject arbitrary JSON into `parse_result`.
- **Recommendation:** Validate `parseResult` with a Zod schema before storage.

---

### 2.11 Solution Provider Logo — `src/app/api/admin/solution-providers/logo/route.ts`

| Check | Status |
|---|---|
| Auth (POST/DELETE): `getMyRole() !== 'admin'` | ✅ |
| File size limit: 2MB | ✅ Line 10 |
| MIME allowlist | ✅ Line 11 |
| Path sanitization | ✅ `slugifyProviderName` + timestamp |

**Finding LOGO-1 (Medium): SVG upload allows stored XSS**
- **Line 11:** `image/svg+xml` is in the allowed set. SVG files can contain `<script>` tags. The uploaded logo URL is returned as a public URL (line 113) and likely rendered in `<img>` tags (safe) but could be opened directly in a browser.
- **Recommendation:** Sanitize SVG content (strip `<script>`, event handlers, `<foreignObject>`) on upload, or serve with restrictive CSP headers.

**Finding LOGO-2 (Low): Client-provided MIME type is trusted**
- **Line 74:** `file.type` comes from the browser and can be spoofed. An attacker could upload a non-image file with a spoofed `image/png` type. However, since the extension allowlist at line 14–16 also validates the filename extension, the risk is reduced.
- **Recommendation:** Consider magic-byte validation for uploaded images.

---

### 2.12 Meeting Attachment — `src/app/api/admin/meeting-settings/attachment/route.ts`

| Check | Status |
|---|---|
| Auth: `getMyRole() !== 'admin'` + user ID check | ✅ |
| File upload | ⚠️ Issues |

**Finding MEETING-1 (High): No file size limit**
- **Lines 30–33:** Only checks `file.size === 0`. No upper bound. An admin can upload files of any size.
- **Recommendation:** Add a size limit (e.g., 10MB).

**Finding MEETING-2 (High): No file type validation**
- **Lines 40–42:** The content type is set to `file.type || 'application/octet-stream'` — entirely client-controlled. Any file type can be uploaded. The file is stored with a public URL returned to the client.
- **Risk:** Executable files, HTML files (XSS), or other malicious content could be uploaded and served.
- **Recommendation:** Add a MIME type allowlist. At minimum, restrict to document and image types.

**Finding MEETING-3 (Medium): Public URL returned for uploaded files**
- **Line 45:** `getPublicUrl(path)` returns a permanent, unauthenticated public URL. Anyone with the URL can access the file indefinitely.
- **Risk:** Sensitive meeting attachments are exposed without access control.
- **Recommendation:** Use signed URLs with expiry instead of public URLs, or ensure the bucket is not publicly accessible.

---

### 2.13 Customer Message Attachment — `src/app/api/customer-messages/attachment/route.ts`

| Check | Status |
|---|---|
| Auth: user must be logged in | ✅ |
| Admin: full access | ✅ |
| Non-admin: scoped to own `messages/{userId}/` prefix | ✅ |
| Path traversal check | ✅ `..` blocked, `messages/` prefix required |

**Finding MSG-ATT-1 (Low): Path traversal protection is good but could be stronger**
- **Line 29:** Checks `storagePath.includes('..')` and `storagePath.startsWith('messages/')`. This is adequate but consider also checking for encoded traversal sequences (`%2e%2e`).
- **Note:** The URL `searchParams.get()` already decodes, so `%2e%2e` becomes `..` and is caught. ✅

**Finding MSG-ATT-2 (Info): Bucket name mismatch is intentional**
- `CUSTOMER_MESSAGE_ATTACHMENT_BUCKET = 'service-bills'` — customer message attachments are stored in the `service-bills` bucket under `messages/` prefix. This is a naming concern, not a security issue, but could cause confusion.

---

### 2.14 Portal Documents — `src/app/api/portal-documents/route.ts`

| Check | Status |
|---|---|
| Auth: `getMyRole() !== 'admin'` | ✅ |
| Redirect to CRM documents | ✅ |

**Finding PDOC-1 (Low): Open redirect potential**
- **Lines 16–18:** Constructs a redirect URL using `new URL('/api/admin/crm/documents', request.url)`. The `request.url` base is used for protocol/host, which comes from the incoming request. In most Next.js deployments this is safe, but if behind a misconfigured reverse proxy, the `Host` header could be manipulated.
- **Recommendation:** Use a hardcoded base URL or validate the host.

---

### 2.15 Portal CRM Documents — `src/app/api/portal/crm/documents/route.ts`

| Check | Status |
|---|---|
| Auth: user logged in + customer resolved | ✅ |
| Customer scoping: `record.customer_id === ctx.customerUuid` | ✅ Line 63 |
| Portal visibility check | ✅ Line 60 |
| Path traversal in local file serving | ✅ `path.basename()` + `startsWith` check |

**Finding CRM-DOC-1 (Medium): Local filesystem file serving**
- **Lines 10, 81–93:** The `serveLocalFile()` function reads files from `candid_portal_all_docs/` on the server filesystem. While `path.basename()` prevents directory traversal, this pattern:
  - Exposes the existence of a server-side document directory
  - Relies on `path.basename()` + `startsWith()` check which is robust, but serving files from the local filesystem is generally discouraged in production
- **Recommendation:** Migrate all documents to Supabase Storage and remove local filesystem serving.

**Finding CRM-DOC-2 (Medium): IDOR potential mitigated but lookup is fragile**
- **Lines 40–56:** The record lookup first searches by `external_id = recordId`, then tries a bare ID variant. The customer ownership check on line 63 prevents unauthorized access, but the double-lookup pattern with `bareId` could match unintended records if external IDs have `::` separators.
- **The ownership check at line 63 is the critical safeguard and it is present.** ✅

**Finding CRM-DOC-3 (Low): `fs.readFileSync` is blocking**
- **Line 91:** Synchronous file read blocks the Node.js event loop. Use `fs.promises.readFile` instead.

---

## 3. Cross-Cutting Concerns

### 3.1 File Upload Summary

| Endpoint | Size Limit | Type Validation | Path Traversal | Public URL |
|---|---|---|---|---|
| Marketing Hub POST | ❌ None | ❌ None | ✅ Safe | ❌ Via storage |
| Solution Provider Logo | ✅ 2MB | ✅ Allowlist | ✅ Safe | ⚠️ Public URL |
| Meeting Attachment | ❌ None | ❌ None | ✅ Safe | ⚠️ Public URL |
| Lead Documents | ❌ None | ❌ None | ✅ Safe | ❌ Signed |
| Customer Message Attach | N/A (download only) | N/A | ✅ Safe | N/A |

### 3.2 SVG/XSS Risk (Cross-Endpoint)

**Finding XSS-1 (Medium): SVG files served inline can execute JavaScript**

Affected endpoints:
- Marketing Hub GET (line 138, `Content-Disposition: inline`)
- Solution Provider Logo (served as public URL, rendered in browser)

SVG files can contain `<script>` tags, `onload` handlers, and `<foreignObject>` elements that execute JavaScript in the browser context of the serving domain. If a user navigates directly to the file URL, the script runs with full same-origin access.

**Recommendation:** Either:
1. Sanitize SVG content on upload (strip scripts and event handlers)
2. Serve all SVGs with `Content-Disposition: attachment`
3. Serve from a separate domain/subdomain (storage isolation)
4. Add `Content-Security-Policy: sandbox` when serving SVGs

### 3.3 Admin Client Usage Pattern

All admin endpoints correctly use the pattern:
```
1. Check auth (getMyRole / canAccessMarketingHub / canManageMarketingHub)
2. Create admin client only after auth passes
3. Perform operations
```
This is correct. The admin client (service-role) is never created before authorization checks. ✅

### 3.4 SQL Injection

No SQL injection vectors found. All database operations use the Supabase client library which parameterizes queries. No raw SQL is constructed. ✅

### 3.5 Command Injection

No command injection vectors found. No `exec()`, `spawn()`, or similar process execution calls. ✅

### 3.6 Error Message Leakage

**Finding ERR-1 (Low): Internal error messages exposed in responses**

Multiple endpoints return `err.message` or `error.message` directly to the client:
- CRM Import (line 39)
- Customer Merge (line 39)
- Marketing Hub (lines 105, 125, 193, 226, 254, 258)
- Lead Documents (lines 48, 115, 130, 166)
- All other endpoints follow the same pattern

These error messages may contain internal implementation details (table names, column names, constraint names) from Supabase/PostgreSQL errors.

**Recommendation:** Log the full error server-side and return generic error messages to the client.

---

## 4. Summary of Findings by Severity

### High (3)
| ID | Finding | Endpoint |
|---|---|---|
| MEETING-1 | No file size limit on meeting attachment upload | meeting-settings/attachment |
| MEETING-2 | No file type validation on meeting attachment upload | meeting-settings/attachment |
| EMAIL-1 | No email address validation — spam relay risk | admin/email/send |

### Medium (10)
| ID | Finding | Endpoint |
|---|---|---|
| AUTH-1 | Domain-based admin fallback if profiles unavailable | auth/roles.ts |
| CRM-IMPORT-1 | No schema validation on import payload arrays | admin/crm/import |
| MERGE-1 | No transactional guarantee on multi-step merge | admin/crm/customers/merge |
| EMAIL-2 | Unsanitized HTML in outbound emails | admin/email/send |
| MKT-1 | No file size limit on marketing asset upload | admin/marketing-hub |
| MKT-2 | No file type restriction on marketing asset upload | admin/marketing-hub |
| MEETING-3 | Public (unauthenticated) URL for meeting attachments | meeting-settings/attachment |
| LDOC-1 | No file size limit on lead document upload | admin/leads/[id]/documents |
| LDOC-2 | No file type restriction on lead document upload | admin/leads/[id]/documents |
| XSS-1 | SVG files served inline can execute JavaScript | marketing-hub, solution-providers/logo |
| CRM-DOC-1 | Local filesystem file serving in production | portal/crm/documents |

### Low (11)
| ID | Finding | Endpoint |
|---|---|---|
| AUTH-2 | Agent role marketing hub access not documented | auth/staff.ts |
| CRM-IMPORT-2 | No import array size limits | admin/crm/import |
| MERGE-2 | Merge result exposes internal IDs | admin/crm/customers/merge |
| MKT-3 | SVG stored XSS vector | admin/marketing-hub |
| MKT-4 | Path sanitization adequate (positive) | admin/marketing-hub |
| LEADS-1 | lead_data JSONB passthrough | admin/leads |
| LEAD-ID-1 | Full lead_data overwrite risk | admin/leads/[id] |
| LDOC-3 | upsert:true could overwrite files | admin/leads/[id]/documents |
| ANALYSIS-1 | parseResult passthrough to DB | admin/leads/[id]/run-analysis |
| LOGO-1 | SVG upload stored XSS | solution-providers/logo |
| LOGO-2 | Client-provided MIME trusted | solution-providers/logo |
| MSG-ATT-1 | Path traversal protection adequate (positive) | customer-messages/attachment |
| PDOC-1 | Potential open redirect | portal-documents |
| CRM-DOC-2 | Fragile record lookup (mitigated) | portal/crm/documents |
| CRM-DOC-3 | Blocking fs.readFileSync | portal/crm/documents |
| ERR-1 | Internal error messages in responses | Multiple |
| PDF-1 | PDF parsing DoS potential | marketing-hub/convert-pdf |

---

## 5. Recommendations

### Immediate (Address in next sprint)

1. **Add file size limits** to all upload endpoints that lack them (MEETING-1, MKT-1, LDOC-1). A reasonable default is 25–50MB.

2. **Add file type allowlists** to all upload endpoints (MEETING-2, MKT-2, LDOC-2). At minimum, block executable types (.exe, .sh, .bat, .js, .html).

3. **Validate email addresses** in the email send endpoint (EMAIL-1). Use a proper email regex and reject malformed addresses.

4. **SVG sanitization** — either sanitize SVG uploads to remove script content, or serve them with `Content-Disposition: attachment` and `Content-Security-Policy: sandbox` headers (XSS-1, LOGO-1, MKT-3).

5. **Use signed URLs instead of public URLs** for meeting attachments (MEETING-3).

### Short-term

6. **Add Zod schema validation** for all JSON request bodies, especially `CrmImportPayload`, `Lead`, and `BillParseResult`.

7. **Wrap the customer merge operation** in a database transaction to prevent race conditions and partial merges (MERGE-1).

8. **Migrate local file serving** to Supabase Storage for `portal/crm/documents` (CRM-DOC-1).

9. **Sanitize error messages** — log full errors server-side, return generic messages to clients (ERR-1).

### Long-term

10. **Remove domain-based admin fallback** once profile-based roles are fully stable (AUTH-1).

11. **Add rate limiting** to the email send endpoint and file upload endpoints.

12. **Audit logging** — log all admin operations (merge, import, email send) to an audit table for accountability.

13. **Content-Security-Policy headers** on all file-serving responses to mitigate XSS from stored files.
