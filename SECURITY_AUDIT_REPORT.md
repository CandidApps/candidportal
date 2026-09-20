# Security Audit Report

**Date:** 2026-07-24  
**Scope:** Race conditions, logic flaws, API security, RLS policies  

---

## 1. Race Conditions / TOCTOU

### 1A. Quote Acceptance — TOCTOU on Double-Accept Check *(Medium)*

**Vulnerability:** The quote-accept POST handler checks `customer_accepted_at` (line 188/288) and returns early if already accepted. However, between the read and the subsequent `INSERT` into `contract_submit_actions` + `UPDATE` of `customer_accepted_at`, a concurrent request could slip through.

**Evidence:**
- `src/app/api/portal/quote-accept/route.ts` lines 172–196 (analysis review path) and 272–296 (quote request path)
- The check is a SELECT, followed by an INSERT into `contract_submit_actions`, then an UPDATE on `bill_analysis_reviews`/`quote_requests`.

**Attack path:** User rapidly double-clicks "Accept Quote" or sends two concurrent POST requests. Both reads see `customer_accepted_at = null`, both proceed to create separate `contract_submit_actions` rows and trigger duplicate downstream effects (notifications, lead stage sync, activity events).

**Mitigation already present:** The `contract_submit_actions` table has unique partial indexes (`contract_submit_actions_analysis_uidx` and `contract_submit_actions_quote_uidx`) that will cause the second insert to fail with a unique constraint violation. This means the race is **partially mitigated at the database level** — the second request will get a 500 error (unhandled unique constraint error) rather than silently succeeding.

**Residual risk:** LOW. The unique index prevents duplicate `contract_submit_actions` rows. However, the 500 error is not gracefully handled — the response will be `{ error: "duplicate key value..." }` rather than `{ ok: true, alreadyAccepted: true }`. **Recommend** catching the unique constraint violation and returning the "already accepted" response.

---

### 1B. Contract Signing — TOCTOU on Status Check *(Low)*

**Vulnerability:** `src/app/api/portal/contracts/[id]/route.ts` reads the contract status (line 41: `existing.status !== 'customer_contract_sent'`), then calls `advanceContractDealStage` which reads + updates. Two concurrent sign requests could both pass the status check.

**Evidence:**
- `src/app/api/portal/contracts/[id]/route.ts` lines 39–56
- `src/lib/services/deal-activity.ts` lines 82–103 (reads then updates without conditional WHERE)

**Attack path:** User double-submits the "I signed it" confirmation. Both requests read `status = 'customer_contract_sent'`, both advance to `customer_contract_signed`.

**Residual risk:** LOW. The state transition is idempotent (both go to the same target state). The only side effect is duplicate `deal_activity_events` entries and a duplicate portal lead update. No functional harm, but audit trail gets duplicated.

---

### 1C. `advanceContractDealStage` — Non-Atomic Read-then-Write *(Low)*

**Vulnerability:** `src/lib/services/deal-activity.ts` lines 82–103 reads the current status, then updates without including the previous status in the WHERE clause as a guard.

**Evidence:**
- Line 82: `SELECT * FROM contract_submit_actions WHERE id = ?`
- Line 94: `UPDATE contract_submit_actions SET status = ? WHERE id = ?` (no `AND status = ?` guard)

**Residual risk:** LOW. This function is called from admin endpoints and the portal contract-sign endpoint. Admin-only callers have low concurrency risk. Portal callers are protected by the prior status check at the API layer.

---

## 2. Business Logic Bypasses

### 2A. Quote Accept Creates Duplicate `contract_submit_actions` on Unique Index Collision *(Low)*

**Vulnerability:** As noted in 1A, the unique indexes on `contract_submit_actions` (one per `analysis_review_id`, one per `quote_request_id`) prevent true duplicates, but the error handling surfaces a raw database error instead of a user-friendly response.

**Exploitable:** No functional duplication occurs. The second request fails at the database level.

---

### 2B. Portal Member Can Look Up Any `account_services` Record *(Low-Medium)*

**Vulnerability:** In `src/app/api/portal/quote-accept/route.ts` lines 248–269, `accountServiceId` comes from user input (`body.accountServiceId`). The subsequent query on `account_services` at line 252 has **no ownership filter** (`user_id` or customer scoping) — it queries by `id` alone using the admin client. This allows the user to probe `crm_customer_id` values of arbitrary account services.

**Evidence:**
- `src/app/api/portal/quote-accept/route.ts` line 156: `accountServiceId` sourced from `body.accountServiceId`
- Lines 249–253: `admin.from('account_services').select('crm_customer_id').eq('id', accountServiceId)` — no user_id filter

**Attack path:** A portal member submits a quote acceptance with an `accountServiceId` belonging to a different user. The handler will read that service's `crm_customer_id` and use it to look up customer company names. This leaks the CRM association and company name of other users' account services.

**Exploitable:** YES, but impact is limited to information disclosure of CRM customer IDs and company names. No write operations are performed on the other user's data — the `account_services.update` at line 442 correctly scopes with `.eq('user_id', user.id)`.

**Recommendation:** Add `.eq('user_id', user.id)` to the `account_services` lookup at line 252.

---

### 2C. PostgREST Filter Injection via `.or()` with String Interpolation *(Medium)*

**Vulnerability:** Several places use `.or()` with string-interpolated user-derived values, which could allow PostgREST filter injection.

**Evidence:**
- `src/app/api/portal/quote-accept/route.ts` line 239: `.or(\`id.eq.${crmRef},external_id.eq.${crmRef}\`)`
- `src/lib/services/portal-leads.ts` line 179: `.or(\`id.eq.${ref},external_id.eq.${ref}\`)`
- `src/lib/services/member-pending-contracts.ts` line 76: `.or(filters.join(','))`

The `crmRef` value at line 234 comes from `review.crm_customer_id` (database-stored), and `svcCrm` comes from another DB lookup — so these are **not directly user-controlled** in the quote-accept path.

However, `member-pending-contracts.ts` line 60–76 builds a filter with `ctx.contactEmail` which, while resolved server-side from the user's email, could contain special PostgREST filter characters if an email like `test,id.eq.other-id` were registered.

**Exploitable:** LOW in practice. The `crmRef` values are database-stored (not direct user input). The email-based filter goes through email validation at signup. However, the pattern is risky — any future code using `.or()` with less-trusted input would be vulnerable.

**Recommendation:** Use parameterized queries or separate `.eq()` calls instead of string interpolation in `.or()`.

---

### 2D. No Duplicate Quote Request Prevention *(Informational)*

**Vulnerability:** `src/app/api/portal/quote-request/route.ts` does not check for existing recent/duplicate quote requests from the same user. A user can submit unlimited quote requests.

**Exploitable:** Not a security vulnerability per se, but could be abused to spam the admin queue.

---

### 2E. Service Request — Partial Duplicate Check *(Low)*

**Vulnerability:** `src/app/api/portal/service-requests/route.ts` lines 106–119 checks for duplicate `member_review_requests` when `accountServiceId` is provided, but:
1. No duplicate check when `accountServiceId` is absent
2. No duplicate check for the `customer_service_tickets` path (non-review escalations)

**Exploitable:** Limited impact — creates extra work items but no privilege escalation.

---

## 3. Mass Assignment / Excessive Data Exposure

### 3A. CRM Customers PATCH — Controlled Field Allowlist *(No Issue)*

**Evidence:** `src/app/api/admin/crm/customers/route.ts` lines 89–111 explicitly constructs a `patch` object with an allowlist of fields. The `CUSTOMER_ENRICHMENT_FIELD_META` loop (line 106) iterates a predefined list and only accepts string values.

**Assessment:** SAFE. Admin-only endpoint with explicit field allowlisting.

---

### 3B. CRM Contacts PUT — Full Contact Object Passed Through *(Low)*

**Vulnerability:** `src/app/api/admin/crm/contacts/route.ts` line 21 passes `body.contact` directly to `upsertCustomerContact()`. The `Contact` type constrains the shape, but TypeScript types are not enforced at runtime — additional fields in the JSON body would be passed through.

**Evidence:** Lines 12–21: body parsed as `{ customerId, contact }`, contact passed directly.

**Exploitable:** Depends on `upsertCustomerContact` implementation. Since this is admin-only, risk is LOW.

---

### 3C. CRM Records PATCH — Full Contract/Document Objects *(Low)*

**Vulnerability:** `src/app/api/admin/crm/records/route.ts` lines 57–59 pass `body.contract` and `body.document` directly to update functions.

**Assessment:** Admin-only, so LOW risk. Same pattern as 3B.

---

### 3D. Portal Team Members POST — Controlled *(No Issue)*

**Evidence:** `src/app/api/portal/team-members/route.ts` lines 87–98 constructs a `Contact` object explicitly from individual fields, not by spreading the request body.

**Assessment:** SAFE. Proper field construction.

---

### 3E. Portal Theme — Controlled *(No Issue)*

**Evidence:** 
- PATCH (lines 100–107): Only allows `presetId` and `colorScheme` with explicit validation.
- POST (lines 139–146): Only allows `name` and `colors` with validation via `validateCustomThemeColors`.

**Assessment:** SAFE.

---

## 4. Rate Limiting

### 4A. No Rate Limiting on Magic Link Auth *(Medium)*

**Vulnerability:** `src/lib/auth/magic-link.ts` calls `supabase.auth.signInWithOtp()` with no application-level rate limiting. This is a client-side module, so the only protection is Supabase's built-in rate limiting on the auth endpoint.

**Evidence:** 
- `src/lib/auth/magic-link.ts` lines 14–40
- No rate limiting middleware found anywhere in the codebase (grep for `rateLimit|rate.?limit|throttle` returned zero results in route files)

**Mitigating factors:** 
- Supabase Auth has built-in rate limiting (default: 30 emails/hour per email address, configurable)
- `shouldCreateUser: false` by default prevents account enumeration via user creation
- The OTP flow is client-side, so server-side rate limiting would need middleware

**Exploitable:** Partially. An attacker could trigger email floods to a victim's address (up to Supabase's rate limit). They cannot bypass authentication itself.

**Recommendation:** Consider adding a CAPTCHA or application-level rate limiter to the login page.

---

### 4B. No Rate Limiting on Any Portal API Endpoints *(Medium)*

**Vulnerability:** No rate limiting exists on any API endpoint. Notable endpoints:
- `POST /api/portal/quote-request` — unlimited quote submissions
- `POST /api/portal/service-requests` — unlimited service requests/escalations
- `POST /api/portal/quote-accept` — unlimited accept attempts
- `POST /api/portal/message-center` — unlimited messages
- `POST /api/portal/team-members` — unlimited team member additions

**Evidence:** Global grep for rate limiting patterns found zero results in route handlers.

**Mitigating factors:** All endpoints require authentication. Supabase provides some inherent connection-level protection.

**Exploitable:** An authenticated user could flood the system with requests, creating noise in admin queues.

**Recommendation:** Add rate limiting middleware, at minimum for write endpoints.

---

### 4C. No Password/Email Change Flows Found *(No Issue)*

The application uses magic-link-only authentication. No password change or email change endpoints exist.

---

## 5. RLS Policy Audit (Recent Migrations)

### 5A. `0076_admin_outreach.sql` — Correct *(No Issue)*

- RLS enabled ✓
- SELECT: `is_admin()` — all admins can see all outreach ✓
- INSERT: `is_admin() AND auth.uid() = owner_user_id` — only owner can create their own rows ✓
- UPDATE: `is_admin() AND auth.uid() = owner_user_id` — only owner can update ✓
- DELETE: `is_admin() AND auth.uid() = owner_user_id` — only owner can delete ✓

**Assessment:** SAFE. Proper admin + ownership checks.

---

### 5B. `0077_admin_sidebar_preferences.sql` — Missing Admin Check *(Low)*

**Vulnerability:** The RLS policy uses `auth.uid() = user_id` without `is_admin()`, meaning any authenticated user (including portal members) can create/read/update/delete their own sidebar preference row.

**Evidence:** Lines 20–24: `using (auth.uid() = user_id) with check (auth.uid() = user_id)`

**Mitigating factors:** 
- The API route (`sidebar-preferences/route.ts`) checks `getMyRole() !== 'admin'` before processing.
- The table is harmless — it only stores sidebar order/hidden arrays.
- Users can only affect their own row.

**Exploitable:** A portal member could directly use the Supabase client to insert a sidebar preferences row. No functional impact since the table only stores UI preferences.

**Assessment:** LOW. Defense-in-depth gap but no real impact.

---

### 5C. `0078_admin_outreach_fields.sql` — Correct *(No Issue)*

- `admin_outreach_column_prefs`: RLS with `auth.uid() = user_id` ✓
- No new policies on `admin_outreach_accounts` (inherits from 0076) ✓

**Assessment:** SAFE. Same pattern as sidebar preferences — user-scoped UI preferences.

---

### 5D. `0079_admin_outreach_tags.sql` — Correct *(No Issue)*

- `admin_outreach_tags`: `is_admin()` for all operations ✓
- `admin_outreach_account_tags`: `is_admin()` for all operations ✓

**Assessment:** SAFE.

---

### 5E. `0080_fix_profiles_admin_rls.sql` — Domain-Based Admin Escalation *(Medium — By Design)*

**Vulnerability:** The `is_admin()` function grants admin access to anyone with a `@candid.solutions` email domain, regardless of their profile role.

**Evidence:** Lines 8–24:
```sql
select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or lower(split_part(coalesce(p.email, ''), '@', 2)) = 'candid.solutions'
      )
  );
```

**Risk:** If an attacker gains access to any `@candid.solutions` email account, they automatically get full admin access to all admin-gated tables. The migration also bulk-updates all existing `@candid.solutions` users to `role = 'admin'`.

**Assessment:** This appears to be **by design** (the migration comment says "align stored roles with who the app already treats as admin"). Risk depends on the security of the `candid.solutions` email domain. If the domain uses proper security controls (MFA, etc.), this is acceptable.

**Recommendation:** Consider adding an explicit admin allowlist rather than blanket domain trust, especially as the team grows.

---

### 5F. `20260713171000_assistant_dismissals.sql` — Overly Broad Admin Policy *(Low)*

**Vulnerability:** The `assistant_dismissals` table uses `is_admin()` for all operations, meaning any admin can read/modify/delete any other admin's dismissals.

**Evidence:** Lines 22–25: `using (public.is_admin()) with check (public.is_admin())`

**Assessment:** LOW. This is likely intentional (admins share a workspace), but ideally dismissals would be scoped to `auth.uid() = owner_id`.

---

### 5G. `20260713181000_contract_submit_actions.sql` — Admin-Only RLS *(Correct)*

- `contract_submit_actions`: Admin-only via `is_admin()` ✓
- Portal writes go through admin client (service-role), bypassing RLS ✓
- Unique partial indexes prevent duplicate submissions ✓

**Assessment:** SAFE.

---

### 5H. `20260713190000_customers_linkedin_url.sql` — No RLS Changes *(No Issue)*

Simple ALTER TABLE to add a column. Inherits existing table RLS.

---

### 5I. `20260713193000_contract_deal_pipeline.sql` — Correct *(No Issue)*

- `deal_activity_events`: Admin-only via `is_admin()` ✓
- Backfill queries are one-time migration operations ✓

**Assessment:** SAFE.

---

### 5J. `20260717223000_team_notes_edit_reply.sql` — No RLS Changes *(No Issue)*

Simple ALTER TABLE to add columns. Inherits existing `team_notes` RLS (`is_admin()`).

**Assessment:** SAFE.

---

## Summary of Findings by Severity

| # | Severity | Finding | Exploitable? |
|---|----------|---------|-------------|
| 2B | Medium | Portal user can probe `account_services.crm_customer_id` of other users | Yes (info disclosure) |
| 2C | Medium | PostgREST `.or()` filter injection pattern | Low in current code |
| 4A | Medium | No rate limiting on magic link authentication | Partially (email flooding) |
| 4B | Medium | No rate limiting on any portal write endpoints | Yes (spam/flooding) |
| 5E | Medium | Domain-based admin escalation (by design) | Conditional on email domain compromise |
| 1A | Low | Quote accept TOCTOU — unique index mitigates but error handling is poor | No (DB prevents duplicates) |
| 1B | Low | Contract signing TOCTOU — idempotent transition | No |
| 1C | Low | `advanceContractDealStage` non-atomic read-then-write | Unlikely |
| 2E | Low | No duplicate service request prevention | Spam only |
| 3B | Low | Admin contact PUT passes full object | Admin-only |
| 5B | Low | Sidebar preferences RLS missing `is_admin()` check | Harmless |
| 5F | Low | Assistant dismissals readable by all admins | By design |
| 2D | Info | No duplicate quote request prevention | Spam only |
| 4C | Info | No password flows exist (magic-link only) | N/A |

---

## Recommended Priority Actions

1. **Add ownership filter to `account_services` lookup** in `quote-accept/route.ts` line 252 — add `.eq('user_id', user.id)`.
2. **Handle unique constraint violation** in `quote-accept/route.ts` — catch the duplicate key error from `contract_submit_actions` insert and return `{ ok: true, alreadyAccepted: true }`.
3. **Avoid string interpolation in `.or()` filters** — refactor to use separate `.eq()` calls or Supabase's filter builder.
4. **Add rate limiting** to authentication and portal write endpoints.
5. **Add `is_admin()` check** to `admin_sidebar_preferences` and `admin_outreach_column_prefs` RLS policies for defense-in-depth.
