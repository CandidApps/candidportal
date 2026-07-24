# Security Audit Report

**Date:** 2026-07-24  
**Scope:** Injection vulnerabilities and dangerous data flows in `/workspace`

---

## Summary

| Severity | Count | Categories |
|----------|-------|------------|
| **HIGH** | 2 | Stored XSS, Open Redirect |
| **MEDIUM** | 3 | Content-Disposition header injection, unsanitized HTML rendering, weak authz check |
| **LOW** | 2 | Minor information leak, missing `..` check on one path |
| **INFO** | 3 | Good practices observed |

---

## FINDING 1 — Stored XSS via `renderNoteBody` (HIGH)

**Files:**
- `src/lib/admin-action-work.ts` lines 84–100
- `src/components/admin/TeamNotesPanel.tsx` line 254
- `src/lib/assistant/data.ts` lines 83, 101

**User-controlled input:** Team note `body` field (stored in `team_notes` table, written by any admin user).

**Dangerous operation:** `renderNoteBody()` performs a regex substitution on the raw body text to add `<span>` tags for @mentions, then the result is injected via `dangerouslySetInnerHTML` **without any HTML escaping or DOMPurify sanitization**.

```typescript
// src/lib/admin-action-work.ts:84-99
export function renderNoteBody(body: string, members: TeamMember[]): string {
  return body.replace(/@([a-zA-Z0-9._-]+)/g, (full, raw: string) => {
    // ... builds <span> tags ...
  });
  // NOTE: body is NOT escaped — any HTML in body passes through verbatim
}
```

**Sanitization:** None. The raw `body` string (which can contain `<script>`, `<img onerror=...>`, etc.) is returned with only @mention spans added.

**Exploitability:** **YES** — An admin user can create a team note with a body like `<img src=x onerror=alert(document.cookie)>` which will execute in every other admin's browser when they view the notes panel. This is a stored XSS because the body is persisted to the database and rendered to all admins.

**Contrast:** The `renderInline()` functions in `AssistantTasksPanel.tsx` (line 152) and `AdminAssistantView.tsx` (line 5415) correctly escape HTML before rendering:
```typescript
function renderInline(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/@([a-z0-9._-]+)/gi, '...');
}
```

**Recommendation:** Apply HTML escaping to `body` in `renderNoteBody` before the @mention regex, the same pattern used in `renderInline()` and `renderChatBody()`.

---

## FINDING 2 — Open Redirect via Database-Stored URLs (HIGH)

**Files:**
- `src/app/api/admin/contract-submit-actions/[id]/contract/route.ts` lines 40–42
- `src/app/api/portal/contracts/[id]/file/route.ts` lines 49–52

**User-controlled input:** `contract_url` field from `contract_submit_actions` database table.

**Dangerous operation:** The server reads a URL from the database and performs `NextResponse.redirect(url)` directly. While the portal route at least requires authentication and ownership checks, any admin who can write to `contract_submit_actions.contract_url` can redirect users to arbitrary external domains.

```typescript
// contract-submit-actions route:
const url = (action.contract_url as string | null)?.trim();
if (url && /^https?:\/\//i.test(url)) {
  return NextResponse.redirect(url); // redirects to ANY http(s) URL
}

// portal contracts route:
const raw = action.contract_url?.trim();
if (raw) {
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return NextResponse.redirect(href); // even worse: prepends https:// to arbitrary string
}
```

**Sanitization:** Only validates that the URL starts with `http://` or `https://`, no domain allowlist.

**Exploitability:** Requires a malicious or compromised admin to store a phishing URL in the database. The portal route is more dangerous because it faces members (customers) who may click a link expecting to see their contract but get redirected to a phishing site. The portal route also prepends `https://` to raw strings, meaning a value like `evil.com/phish` would redirect to `https://evil.com/phish`.

**Recommendation:** Validate redirect URLs against a domain allowlist (e.g., Supabase storage domains, known contract platforms).

---

## FINDING 3 — Unsanitized Email HTML in `dangerouslySetInnerHTML` (MEDIUM)

**Files:**
- `src/components/admin/AdminAssistantView.tsx` lines 4328, 4511, 4874

**User-controlled input:** Email HTML content fetched from Zoho Mail API via `/api/admin/email/conversation`.

**Dangerous operation:** Raw email HTML is rendered via `dangerouslySetInnerHTML={{ __html: content ?? '' }}` without passing through `sanitizeEmailHtml()`.

```typescript
// Line 4511 — single email view:
<div className="assist-emailview-html" dangerouslySetInnerHTML={{ __html: content ?? '' }} />

// Line 4874 — conversation thread view:
<div className="assist-emailview-html" dangerouslySetInnerHTML={{ __html: contentById[m.messageId]! }} />
```

**Sanitization:** None on the rendering side. The `sanitizeEmailHtml()` function exists in `src/lib/rich-text.ts` and is used in `SupplierContractReplyModal.tsx` but is **not** used in `AdminAssistantView.tsx`.

**Exploitability:** A malicious external sender could craft an email with embedded `<script>`, `<img onerror=...>`, or CSS-based exfiltration that executes in the admin's browser. However, exploitation requires: (1) the attacker sending an email to the business, and (2) an admin opening that email in the assistant view.

**Recommendation:** Pass all Zoho email content through `sanitizeEmailHtml()` before rendering.

---

## FINDING 4 — Content-Disposition Header Injection (MEDIUM)

**File:** `src/app/api/admin/quote-requests/[id]/proposal/route.ts` lines 96–97

**User-controlled input:** The filename derived from `storagePath.split('/').pop()`.

**Dangerous operation:** The filename is inserted into the `Content-Disposition` header **without stripping double quotes**:

```typescript
'Content-Disposition': `inline; filename="${filename}"`,  // NO .replace(/"/g, '') here
```

All **other** download endpoints in the codebase correctly strip double quotes:
```typescript
// All other routes:
'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
```

**Sanitization:** The `safeSegment()` function used during upload already strips most special characters, so the stored filename is likely safe. However, the `storagePath` is taken directly from the query string on download, so a crafted path could inject headers.

**Exploitability:** Low practical risk because (1) the `safeSegment` on upload constrains filenames, and (2) the `storagePath` must start with `quote-proposals/` and contain the user_id. However, the inconsistency represents a defense-in-depth gap.

**Recommendation:** Add `.replace(/"/g, '')` to match the pattern used everywhere else.

---

## FINDING 5 — Hank AI Body Rendered as Raw HTML (MEDIUM)

**File:** `src/components/admin/AdminMessageCenterView.tsx` lines 612–616

**User-controlled input:** Hank AI response body stored in the database.

**Dangerous operation:** When `m.authorKind === 'hank'`, the message body is rendered directly via `dangerouslySetInnerHTML` without sanitization. Human messages go through `renderChatBody()` which escapes HTML, but Hank messages bypass this:

```typescript
dangerouslySetInnerHTML={{
  __html:
    m.authorKind === 'hank'
      ? m.body                              // NO sanitization
      : renderChatBody(m.body, members),    // HTML-escaped
}}
```

**Sanitization:** None for Hank messages.

**Exploitability:** Low — requires compromising the AI response pipeline or database. If an attacker could inject content into the `message_center_messages` table with `author_kind = 'hank'`, they could execute arbitrary JavaScript in all admin browsers viewing that channel.

**Recommendation:** Pass Hank bodies through `formatHankChatHtml()` or `sanitizeRichHtml()`.

---

## FINDING 6 — Minor: `pConfirmText` / `quoteConfirmText` XSS via User Input (LOW)

**File:** `src/components/CandidApp.tsx` lines 2818, 2910, 2914, 3855, 4627

**User-controlled input:** Form fields `quoteName`, `quoteEmail`, `pName`, `pEmail`, `pTeamEmails`.

**Dangerous operation:** User-entered values are interpolated into HTML strings and rendered via `dangerouslySetInnerHTML`:
```typescript
setQuoteConfirmText(`Thank you, <strong>${quoteName}</strong>. Your request...`);
// later:
dangerouslySetInnerHTML={{ __html: quoteConfirmText }}
```

**Sanitization:** None.

**Exploitability:** This is a **self-XSS** — the user would be injecting HTML into their own browser session only (client-side state, not persisted). Still, if the form prefills from URL params or shared state, it could be escalated.

**Recommendation:** Escape the interpolated values or use React elements instead of `dangerouslySetInnerHTML`.

---

## FINDING 7 — Weak Authorization on Proposal Storage Path (LOW)

**File:** `src/app/api/admin/quote-requests/[id]/proposal/route.ts` lines 82–86

**User-controlled input:** `storagePath` query parameter.

**Dangerous operation:** Authorization check uses `storagePath.includes(String(row.user_id))`:

```typescript
if (!storagePath.includes(String(row.user_id))) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

**Exploitability:** An admin user could craft a `storagePath` that contains another user's UUID as a substring to access their proposals. For example, including the target user_id in a filename segment. However, this is behind admin auth and the Supabase storage download would still need a valid path.

**Recommendation:** Use a stricter check like verifying the path starts with `quote-proposals/${row.user_id}/`.

---

## AREAS WITH NO ISSUES FOUND (INFO)

### SQL Injection / Raw Queries
No raw SQL, template literal queries, `.rpc()` calls, `.sql()`, `.raw()`, or non-parameterized queries found anywhere in the codebase. All database operations use the Supabase client's query builder (`.from().select()`, `.eq()`, `.in()`, `.upsert()`, etc.), which parameterizes all values automatically.

**Files checked:** All files in `src/lib/crm/`, `src/lib/services/`, `src/lib/team-notes-server.ts`, `src/lib/outreach-server.ts`, and all files using Supabase operations.

### Path Traversal
Path traversal protections are properly implemented across all file-serving endpoints:

- **`src/app/api/customer-messages/attachment/route.ts`** — Checks for `..` in path AND requires `messages/` prefix AND validates user ownership via `messages/${user.id}/` prefix for non-admin users. ✅
- **`src/app/api/admin/crm/documents/route.ts`** — Uses `path.basename()` and `fullPath.startsWith(DOCS_DIR)` checks. ✅
- **`src/app/api/portal/crm/documents/route.ts`** — Same `path.basename()` + `startsWith` pattern, plus customer ownership check. ✅
- **`src/app/api/admin/leads/[id]/documents/route.ts`** — Downloads from Supabase storage using a `storagePath` that was constructed with `safeSegment()` during upload. ✅
- **Upload endpoints** — All use `safeSegment()` which strips everything except `[a-zA-Z0-9._-]`. ✅

### Unsafe Deserialization / eval
No uses of `eval()`, `new Function()`, `vm` module, or `uneval()` found in the `src/` directory.

### Zoho OAuth
The Zoho OAuth implementation is well-protected:
- **CSRF protection:** Random nonce stored in httpOnly cookie and echoed in the `state` parameter. Callback verifies nonce match. ✅
- **Open redirect:** The callback's `redirectToApp()` always redirects to `/admin` (hardcoded path on same origin). ✅
- **State validation:** Malformed state triggers an error redirect, not an exception. ✅

### Auth Callback Open Redirect
`src/app/auth/callback/route.ts` — The `next` parameter is validated to start with `/`, preventing protocol-relative or absolute URL redirects. ✅

---

## Recommendations Summary

| Priority | Action |
|----------|--------|
| **P0** | Add HTML escaping to `renderNoteBody()` in `src/lib/admin-action-work.ts` |
| **P0** | Sanitize email HTML in `AdminAssistantView.tsx` using `sanitizeEmailHtml()` |
| **P1** | Add domain allowlist for redirect URLs in contract routes |
| **P1** | Add `.replace(/"/g, '')` to filename in quote-request proposal route |
| **P1** | Sanitize Hank AI message bodies before rendering |
| **P2** | Escape user input in `pConfirmText` / `quoteConfirmText` interpolation |
| **P2** | Strengthen `storagePath.includes(user_id)` to prefix check |
