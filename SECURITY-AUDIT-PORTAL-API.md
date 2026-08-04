# Portal API Security Audit — New Findings

**Date:** 2026-08-04
**Scope:** All route handlers under `src/app/api/portal/`
**Excludes:** Previously reported issues (CRM IDOR, message-center IDOR, preview cookie bypass, access gate bypass, quote-accept pricing forge, team-members privilege escalation, admin notes leak)

---

## Finding 1: Scheduling Book — Email/Calendar Impersonation via Attacker-Controlled customerEmail

**Severity:** MEDIUM-HIGH
**File:** `src/app/api/portal/scheduling/book/route.ts`, lines 34–35
**Downstream:** `src/lib/services/bill-meeting-booking.ts`, lines 163–176 (calendar), 206–221 (email)

### Description

The `/api/portal/scheduling/book` POST endpoint accepts `customerEmail` and `customerName` from the request body without verifying they belong to (or match) the authenticated user. These attacker-controlled values are passed to `bookBillMeeting()`, which:

1. Creates a calendar event on the specialist's Zoho Calendar with the attacker-supplied email as an attendee (bill-meeting-booking.ts line 173).
2. Sends a confirmation email **from** `"Candid — [specialist name]"` **to** the attacker-supplied email address (bill-meeting-booking.ts lines 206–221).

### Attack Path

1. Authenticate as any portal user.
2. `POST /api/portal/scheduling/book` with `{ specialistId: "...", startISO: "...", endISO: "...", customerEmail: "victim@example.com", customerName: "CEO Name" }`.
3. Victim receives an official-looking Candid meeting invitation email and calendar invite they never requested.

### Impact

- **Email abuse / phishing vector:** Attacker triggers legitimate Candid infrastructure to send emails to arbitrary addresses, which could be used for social engineering.
- **Calendar injection:** Arbitrary email addresses are added as calendar event attendees.
- **Impersonation:** Meeting booking records are associated with a spoofed identity.

---

## Finding 2: Locations Endpoint — Location-Scoped Contacts Receive All Customer Locations

**Severity:** MEDIUM
**File:** `src/app/api/portal/locations/route.ts`, lines 20–24

### Description

The `GET /api/portal/locations` endpoint returns **all** locations for the customer regardless of the authenticated contact's `locationIds` restriction. A non-primary contact scoped to specific locations receives the full list of customer locations (addresses, labels, IDs) for locations outside their authorized scope.

### Code

```
const { data: locRows, error } = await admin
  .from('customer_locations')
  .select('*')
  .eq('customer_id', ctx.customerUuid)          // no locationIds filter
  .order('is_primary', { ascending: false });
```

The response includes `scopedLocationIds` and `hasMasterAccess` for the front-end to filter, but the API itself sends all location data.

### Attack Path

1. Authenticate as a non-primary portal contact who has `location_ids` restricting them to a subset of locations.
2. `GET /api/portal/locations`
3. Response includes full address details (street, city, state, zip) for every customer location, not just the scoped ones.

### Impact

- **Data leakage:** Location-scoped users can read addresses and metadata for locations they should not have access to.
- **Authorization bypass:** The location scoping model is enforced only client-side; the API returns unfiltered data.

---

## Finding 3: CRM Documents — Error-Oracle Enumeration of Cross-Customer Document IDs

**Severity:** LOW-MEDIUM
**File:** `src/app/api/portal/crm/documents/route.ts`, lines 41–65

### Description

The first database query (line 41–45) looks up `customer_records` by `external_id` using the admin client **without** a `customer_id` filter. While the ownership check at line 63 correctly blocks file download for cross-customer documents, the differentiated HTTP error responses create an error oracle:

| Condition | Response |
|---|---|
| Record doesn't exist | 404 "Not found" (line 59) |
| Record exists, `visible_in_portal = false` | 404 "Not available" (line 61) |
| Record exists, belongs to different customer | 403 "Forbidden" (line 64) |

### Attack Path

1. Authenticate as any portal user.
2. Iterate over candidate `recordId` values via `GET /api/portal/crm/documents?recordId=<probe>`.
3. Distinguish 404-"Not found" (doesn't exist), 404-"Not available" (exists but hidden), and 403 (exists and visible but belongs to another customer) to enumerate valid document external IDs and their portal-visibility status.

### Impact

- **Information disclosure:** Attackers can enumerate valid document `external_id` values across all customers and determine their `visible_in_portal` flag.

---

## Finding 4: Service-Requests POST — Unvalidated accountServiceId in Admin-Facing Escalation Records

**Severity:** LOW-MEDIUM
**File:** `src/app/api/portal/service-requests/route.ts`, lines 106–171

### Description

When escalating a service request (`outcome === 'escalated'`), the handler creates review requests (lines 122–138) or support tickets (lines 147–158) via the **admin client**, linking them to the user-supplied `body.accountServiceId` and `body.crmCustomerId` without verifying these IDs belong to the authenticated user.

The seat-count update path (lines 215–269) **is** properly protected with an ownership check (`.eq('user_id', user.id)` at line 219), but the initial escalation record creation is not.

### Attack Path

1. Authenticate as any portal user.
2. `POST /api/portal/service-requests` with `{ category: "billing_help", outcome: "escalated", serviceName: "X", message: "help", accountServiceId: "<other-users-service-id>", crmCustomerId: "<other-customer-uuid>" }`.
3. A `member_review_requests` or `customer_service_tickets` row is created by the admin client, linked to another user's service and CRM customer record.

### Impact

- **Data integrity:** Admin-facing escalation records (review requests, support tickets) can be associated with arbitrary `account_service_id` and `crm_customer_id` values, potentially causing admin staff to take incorrect actions on the wrong customer/service.

---

## Finding 5: Scheduling Book & Service-Requests — No Rate Limiting on Meeting Bookings or Ticket Creation

**Severity:** LOW
**Files:**
- `src/app/api/portal/scheduling/book/route.ts`
- `src/app/api/portal/service-requests/route.ts` (POST)
- `src/app/api/portal/review-requests/route.ts` (POST)
- `src/app/api/portal/quote-request/route.ts` (POST)

### Description

None of the write endpoints that create external side effects (calendar events, emails, support tickets, review requests, quote requests) implement rate limiting. Combined with Finding 1 (email impersonation), an attacker can generate a high volume of calendar events, confirmation emails, and support tickets.

### Impact

- **Abuse amplification:** Attackers can flood the system with bookings, tickets, and emails.
- **Denial of service for admin staff:** Large volumes of illegitimate escalations could overwhelm the admin action center.

---

## Summary Table

| # | Finding | Severity | File(s) |
|---|---------|----------|---------|
| 1 | Scheduling book email/calendar impersonation | **MEDIUM-HIGH** | `scheduling/book/route.ts` |
| 2 | Location data leak to scoped contacts | **MEDIUM** | `locations/route.ts` |
| 3 | Document ID error-oracle enumeration | **LOW-MEDIUM** | `crm/documents/route.ts` |
| 4 | Unvalidated accountServiceId in escalations | **LOW-MEDIUM** | `service-requests/route.ts` |
| 5 | No rate limiting on write endpoints | **LOW** | Multiple |

---

## Routes Reviewed — No New Issues Found

The following routes were reviewed and found to have adequate authentication and authorization for the operations they perform:

- `src/app/api/portal/contracts/route.ts` — GET properly scoped via `listPendingContractsForCustomer(ctx)`
- `src/app/api/portal/contracts/[id]/route.ts` — POST ownership verified via `loadPendingContractForCustomer(id, ctx)`
- `src/app/api/portal/contracts/[id]/file/route.ts` — GET ownership verified via `loadPendingContractForCustomer(id, ctx)`
- `src/app/api/portal/solutions/route.ts` — GET returns public catalog data, no customer-specific scoping needed
- `src/app/api/portal/notifications/route.ts` — GET/PATCH properly scoped by `user_id` via RLS client
- `src/app/api/portal/review-requests/route.ts` — GET/POST properly scoped by `user_id` via RLS client
- `src/app/api/portal/theme/route.ts` — GET/PATCH/POST properly scoped by `user_id`
- `src/app/api/portal/theme/custom/[id]/route.ts` — GET/PATCH/DELETE properly scoped by `user_id`
- `src/app/api/portal/quote-bill/route.ts` — POST scoped to user's storage path
- `src/app/api/portal/quote-request/route.ts` — POST creates records under `user.id`
- `src/app/api/portal/analysis-reviews/route.ts` — GET/POST scoped by `user_id` via RLS client
- `src/app/api/portal/analysis-reviews/[id]/confirm/route.ts` — POST ownership verified (`user_id` check at line 55)
- `src/app/api/portal/merchant-analysis-providers/route.ts` — GET returns public provider data
- `src/app/api/portal/scheduling/availability/route.ts` — GET returns non-sensitive availability data
