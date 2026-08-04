# Security Audit Findings — August 2026

Audit scope: Race conditions, business logic bypasses, dangerous API patterns,
RLS/database security, notification security, and Zoho integration security.

> Excludes the five previously-reported issues (SQL read-only bypass, profiles
> RLS privilege escalation, wide-open 0009 RLS, Plaid webhook signature, Hank
> XSS).

---

## Finding 1: Quote-Accept Race Condition (TOCTOU) — Double-Accept

**Severity: Medium**
**File:** `src/app/api/portal/quote-accept/route.ts`, lines 188–195 / 288–295

### Description

The quote-accept endpoint checks `customer_accepted_at` (line 188) then later
writes it (line 452). Between the read and the write there is no row-level lock
or atomic compare-and-swap (the `UPDATE` does not include a
`WHERE customer_accepted_at IS NULL` guard). Two concurrent POST requests can
both pass the `if (review.customer_accepted_at)` check, resulting in:

- Two `contract_submit_actions` rows (or clobber of the existing one).
- Two deal-activity events logged.
- Two notification emails / messages.
- The acceptance payload from the second request silently overwrites the first
  (financial totals, contact details, etc.).

### Attack Path

1. Customer (or automated script) fires two simultaneous POSTs with different
   `monthlyTotal` / `lines` values.
2. Both pass the idempotency guard.
3. Second request overwrites `customer_acceptance` with attacker-chosen pricing.

### Impact

Corrupted deal pipeline data. Attacker can substitute quoted prices/savings in
the acceptance record, affecting downstream commission calculations and contract
terms.

### Recommended Fix

Add `customer_accepted_at IS NULL` to the UPDATE WHERE clause (making the write
conditional) and re-read after update to detect the race:

```sql
UPDATE bill_analysis_reviews
SET customer_accepted_at = $now, customer_acceptance = $payload
WHERE id = $id AND user_id = $uid AND customer_accepted_at IS NULL;
```

If zero rows are affected, treat as already-accepted.

---

## Finding 2: Contract Deal Stage Can Be Regressed by Admin API

**Severity: Medium**
**File:** `src/lib/services/deal-activity.ts`, lines 74–128

### Description

`advanceContractDealStage` performs no forward-only validation. Despite the name
"advance", it blindly sets the status to whatever `toStatus` the caller
requests. The admin PATCH endpoint at
`src/app/api/admin/contract-submit-actions/route.ts` (line 372–391) calls it
with `normalizeContractDealStage(body.status)` which accepts any valid stage.

An admin (or a compromised admin session) can regress a deal from `converted`
back to `quote_accepted`, re-opening a finalized deal.

### Attack Path

```http
PATCH /api/admin/contract-submit-actions
{ "id": "<deal-id>", "status": "quote_accepted" }
```

### Impact

Reversal of completed deals. A regressed deal can be modified, have its pricing
changed, or be re-converted with different commission splits.

### Recommended Fix

Add a monotonic stage check in `advanceContractDealStage`:

```ts
const stageIndex = CONTRACT_DEAL_STAGES.indexOf;
if (stageIndex(toStatus) <= stageIndex(current)) {
  return { action: null, error: 'Cannot regress deal stage' };
}
```

---

## Finding 3: PostgREST Filter Injection via `.or()` with Unsanitized DB Values

**Severity: Medium**
**File:** `src/app/api/portal/quote-accept/route.ts`, lines 239, 261
**Also:** `src/lib/services/portal-leads.ts` line 179,
`src/lib/services/member-pending-contracts.ts` lines 60–74

### Description

Several code paths build PostgREST `.or()` filter strings by interpolating
database column values (e.g. `crm_customer_id`, `external_id`) directly into
the filter expression:

```ts
.or(`id.eq.${crmRef},external_id.eq.${crmRef}`)
```

If an admin (or any write path) stores a `crm_customer_id` value containing a
comma followed by another PostgREST filter predicate, it becomes part of the
`or()` clause. For example, the value `x,id.neq.x` would match all rows.

In `member-pending-contracts.ts` lines 60–61, the `customerExternalId` and
`contactEmail` from the resolved portal customer context are interpolated into
`.or()` filters against `contract_submit_actions`. While these values come from
the CRM database rather than direct user input, any admin-writable CRM field
that flows into these filters (which `crm_customer_id` is) can be weaponized.

### Attack Path

1. An admin (or CRM import) writes a customer's `crm_customer_id` as
   `x,status.neq.x`.
2. When quote-accept runs, the `.or()` becomes
   `id.eq.x,status.neq.x,external_id.eq.x,status.neq.x` — matching unrelated
   customer rows.
3. Data from the wrong customer is returned/modified.

### Impact

Cross-customer data leakage and incorrect CRM linkage. In the pending-contracts
path, a portal member could see contracts belonging to other customers.

### Recommended Fix

Use parameterized `.eq()` / `.or()` calls rather than string interpolation.
For multi-column OR, build with two separate queries or use `.or()` with
pre-validated UUID values only (reject values containing commas or dots).

---

## Finding 4: Host-Header Spoofing Bypasses push-local Localhost Guard

**Severity: Medium**
**File:** `src/app/api/persistence/push-local/route.ts`, lines 10–14
**Also:** `src/lib/persistence/config.ts`, lines 47–50

### Description

The `push-local` endpoint is meant for local development only. It gates access
with two checks: `isLocalPersistence()` (env var) and
`isLocalhostRequestHost(request.headers.get('host'))`.

The second check reads the `Host` header from the request. When deployed behind
a reverse proxy that does not override or validate the `Host` header (or when
no `X-Forwarded-Host` normalization is in place), an attacker can send:

```http
POST /api/persistence/push-local HTTP/1.1
Host: localhost
```

This would pass the hostname check. The `isLocalPersistence()` check based on
the env var is still required, but if `NEXT_PUBLIC_DATA_PERSISTENCE=local` is
ever set in a staging/preview deployment, the endpoint becomes fully accessible.

The endpoint uses an admin Supabase client to write arbitrary snapshot data
(services, reviews, leads) and when the caller is an admin, there is no
`userIdFilter`, meaning it can write data for any user.

### Attack Path

1. A staging/preview environment has `NEXT_PUBLIC_DATA_PERSISTENCE=local`.
2. Attacker sends a request with `Host: localhost` and valid auth cookies.
3. The push-local endpoint accepts it and writes arbitrary data via admin client.

### Impact

Arbitrary data injection into production-adjacent databases. Admin callers can
write data as any user.

### Recommended Fix

Do not rely on the `Host` header for security decisions. Instead, check a
server-side environment variable like `NODE_ENV === 'development'` or an
explicit `ALLOW_LOCAL_PUSH=true` flag. Remove the `Host` header check entirely.

---

## Finding 5: Bootstrap Endpoint Lacks Timing-Safe Secret Comparison & Rate Limiting

**Severity: Low–Medium**
**File:** `src/app/api/admin/bootstrap/route.ts`, lines 22–23

### Description

The bootstrap endpoint promotes any Supabase Auth user to admin by setting
`role: 'admin'` in their profile. It is protected by a static secret
(`ADMIN_BOOTSTRAP_SECRET`). However:

1. The comparison `providedSecret !== expectedSecret` uses JavaScript's `!==`
   which is not timing-safe, allowing timing side-channel attacks to recover the
   secret byte-by-byte.
2. There is no rate limiting on the endpoint, allowing rapid brute-force
   attempts.
3. The endpoint is always deployed (no dev-only gate) and only requires the
   secret to be set in the environment.

### Attack Path

1. Attacker discovers the bootstrap endpoint exists (public Next.js route).
2. Uses timing analysis over many requests to deduce the secret character by
   character.
3. Once known, calls the endpoint to make their account an admin.

### Impact

Full privilege escalation to admin. Any Supabase Auth user becomes an admin
with access to all CRM data, customer PII, and commission information.

### Recommended Fix

Use `crypto.timingSafeEqual()` for the secret comparison:

```ts
import { timingSafeEqual } from 'crypto';
const a = Buffer.from(providedSecret);
const b = Buffer.from(expectedSecret);
if (a.length !== b.length || !timingSafeEqual(a, b)) { ... }
```

Also consider disabling the endpoint in production via an environment check,
or adding rate limiting.

---

## Finding 6: Open Redirect in Portal Contract File Route

**Severity: Low–Medium**
**File:** `src/app/api/portal/contracts/[id]/file/route.ts`, lines 49–52

### Description

When a contract has a `contract_url` stored but no `contract_storage_path`,
the endpoint redirects to the URL after only checking for `http://` or `https://`
prefix, and prepends `https://` to non-matching values:

```ts
const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
return NextResponse.redirect(href);
```

The `contract_url` is set by admins when creating deals. If an admin account is
compromised, or if the value is imported from an untrusted external source
(supplier email), the URL can point to a phishing site.

A portal member clicking "View Contract" would be redirected to the attacker's
domain.

### Attack Path

1. Admin (or compromised admin session) sets `contract_url` to
   `https://evil.example.com/fake-contract-login`.
2. Portal member visits `/api/portal/contracts/{id}/file`.
3. Browser redirects to attacker-controlled site.

### Impact

Phishing attacks against portal members. The redirect comes from the trusted
app domain, increasing effectiveness.

### Recommended Fix

Validate that `contract_url` points to a known/trusted domain (allowlist) before
redirecting, or serve the content proxied rather than via redirect.

---

## Finding 7: CRM Merge Has No Transaction Isolation — Partial Merge on Error

**Severity: Medium**
**File:** `src/lib/crm/merge-customers.ts`, lines 59–373

### Description

`mergeCustomerAccounts` performs ~15 sequential database operations (move
locations, contacts, deals, records, update text references, archive source)
without wrapping them in a database transaction. If any operation fails midway
(e.g. network error, constraint violation), the merge leaves the data in an
inconsistent state:

- Some deals moved to target, others still on source.
- Source customer partially archived.
- Location mappings incomplete, causing orphaned foreign key references.

The function throws on individual errors, but each prior step has already
committed.

### Attack Path

No external attacker needed — this is a reliability/integrity issue. A
constraint violation (e.g. duplicate external_id) during contact migration
leaves the source customer partially merged with no rollback.

### Impact

Data corruption: deals and records orphaned across two accounts, broken CRM
linkages. Manual cleanup required, with risk of losing data.

### Recommended Fix

Use Supabase's `rpc()` to call a server-side PL/pgSQL function that performs
all merge steps inside a single `BEGIN ... COMMIT` transaction, or use
PostgREST's transaction-scoped operations.

---

## Finding 8: Meeting Double-Booking Race Condition

**Severity: Low**
**File:** `src/lib/services/bill-meeting-booking.ts`, lines 246–269

### Description

The `bookBillMeeting` function checks specialist availability via Zoho's
free/busy API (line 246–249), then creates the calendar event (line 257). Between
the availability check and the event creation, another booking request can pass
the same check, resulting in two meetings at the same time.

There is no server-side lock or atomic reservation — the free/busy data is a
read-only snapshot from Zoho's API and is not updated until the calendar event
is actually created and propagated.

### Attack Path

1. Two portal members simultaneously book the same specialist at the same time.
2. Both pass the `isFreeDuring` check.
3. Both calendar events are created, double-booking the specialist.

### Impact

Operational: specialists get double-booked. Low security impact but affects
service reliability.

### Recommended Fix

Add an application-level lock (e.g. a database row with a unique constraint on
`specialist_id + time_slot`) that is claimed atomically before creating the
calendar event.

---

## Finding 9: Portal Member Fallback Bypasses `portal_access` Check

**Severity: Medium**
**File:** `src/lib/portal/member-customer-resolve.ts`, lines 140–146

### Description

`resolvePortalCustomerForRequest` first looks for a contact with
`portal_access = true`, but if that fails, it falls back to finding any contact
matching the email **without** requiring `portal_access`:

```ts
const withAccess = await resolveMemberPortalCustomer(email, { requirePortalAccess: true });
if (withAccess) return withAccess;
const anyContact = await resolveMemberPortalCustomer(email, { requirePortalAccess: false });
if (anyContact) return anyContact;
```

This means any user whose email appears in the `customer_contacts` table — even
with `portal_access = false` — gains full portal API access to that customer's
data (contracts, quotes, services, etc.).

### Attack Path

1. An admin creates a customer contact with `portal_access = false` (explicitly
   revoking portal access).
2. The contact's email has a Supabase Auth account.
3. The user signs in and accesses portal APIs — the fallback resolves them as
   the customer despite `portal_access = false`.

### Impact

Authorization bypass: users explicitly denied portal access can still view and
interact with customer data (contracts, quotes, pending signatures).

### Recommended Fix

Remove the `requirePortalAccess: false` fallback, or restrict it to read-only
informational endpoints. All write endpoints (quote-accept, contract-sign)
should require `portal_access = true`.

---

## Summary

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| 1 | Quote-accept TOCTOU double-accept | Medium | Race Condition |
| 2 | Deal stage can be regressed by admin | Medium | Business Logic |
| 3 | PostgREST filter injection via `.or()` | Medium | Injection |
| 4 | Host-header spoofing bypasses push-local | Medium | API Security |
| 5 | Bootstrap secret not timing-safe | Low–Medium | API Security |
| 6 | Open redirect in contract file route | Low–Medium | Open Redirect |
| 7 | CRM merge lacks transaction isolation | Medium | Data Integrity |
| 8 | Meeting double-booking race condition | Low | Race Condition |
| 9 | Portal access fallback bypasses portal_access flag | Medium | AuthZ Bypass |
