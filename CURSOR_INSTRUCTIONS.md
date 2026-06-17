# Cursor Instructions — Commission Processor Integration
## CandidPortal · Commissions Tab → "Upload New" Sub-Tab

---

## Overview

We are integrating a pre-built React component called `CommissionProcessor` into the CandidPortal app.
It should appear in the **admin-only** area under the **Commissions** tab as the **"Upload New"** sub-tab,
which currently exists but renders a blank view.

The component processes three commission file types (Nuvei, CheckCommerce, Vendara), produces a
combined Excel download, and upserts rows into Supabase.

---

## Step 1 — Install Required Dependency

The component uses SheetJS for Excel processing. Install it if not already present:

```bash
npm install xlsx
```

> ⚠️ Do NOT install `@types/xlsx` — SheetJS ships its own types.

---

## Step 2 — Add the Component File

Copy the file `CommissionProcessor.jsx` (or `.tsx` if you rename it) into the components directory.
Suggested path:

```
src/
  components/
    commissions/
      CommissionProcessor.jsx
```

If the project uses TypeScript, rename to `CommissionProcessor.tsx`. The component has no explicit
TypeScript types so Cursor should add them — but it will also work as `.jsx` in a TS project with
`allowJs: true` in `tsconfig.json`.

---

## Step 3 — Wire It Into the "Upload New" Sub-Tab

Find the file that renders the Commissions tab sub-tabs. It may be named something like:
- `CommissionsPage.tsx`
- `Commissions.tsx`
- `AdminCommissions.tsx`
- Or a route file under `app/admin/commissions/` (if using Next.js App Router)

Look for the "Upload New" tab/route that currently renders nothing (blank view).

**Replace the blank view with:**

```tsx
import CommissionProcessor from "@/components/commissions/CommissionProcessor";

// Inside the "Upload New" tab render:
<CommissionProcessor />
```

Adjust the import path to match your project's alias (`@/`, `~/`, `../../`, etc.).

---

## Step 4 — Admin-Only Guard

The component should only be accessible to admin users. The existing tab structure likely already
handles this, but confirm that the route or tab is wrapped in an admin auth check. If not, add a
guard such as:

```tsx
// Example using a hypothetical useAuth hook — match your app's actual auth pattern
const { user } = useAuth();
if (!user?.isAdmin) return <Navigate to="/" />;
```

Do NOT add a new auth check if one already exists on the parent Commissions page or route — just
confirm the "Upload New" sub-tab inherits the same protection.

---

## Step 5 — Environment / CORS Note

The component calls Supabase directly from the browser using the anon key. This is intentional and
safe for this use case. No server-side API route is needed. The Supabase project is already
configured with the correct RLS policies.

If the app has a Content Security Policy (CSP) header, ensure `https://xqzerfzlisvqcgatpeyv.supabase.co`
is in the `connect-src` directive.

---

## Step 6 — Styling Compatibility

The component uses **inline styles only** — no Tailwind classes, no CSS modules, no global CSS.
It is fully self-contained and will not conflict with the app's existing styles.

It has its own light-blue (`#f0f4ff`) page background. If the CandidPortal app wraps page content
in a container that already has a background color, you may want to remove the `minHeight: "100vh"`
and `background: "#f0f4ff"` from the outermost `<div>` in `CommissionProcessor.jsx` so it inherits
the portal's background instead. The relevant lines are at the top of the return statement:

```jsx
// Find this in CommissionProcessor.jsx and adjust as needed:
<div style={{ minHeight: "100vh", background: "#f0f4ff", ... }}>
```

---

## Step 7 — Verify

After wiring up:

1. Log in as an admin user
2. Navigate to Commissions → Upload New
3. Confirm the period selector, drop zone, and four file slots render correctly
4. Drop a test file and confirm it routes to the correct slot (Nuvei, CheckCommerce, or Vendara)
5. Process and confirm the Excel download triggers
6. Click "Save to Database" and confirm rows appear in Supabase under the correct table:
   - `nuvei_commissions`
   - `checkcommerce_commissions`
   - `vendara_commissions`

---

## Summary of What the Component Does

| Feature | Detail |
|---|---|
| Period selector | Year + month dropdowns, defaults to current month, controls DB period field and output filename |
| File detection | Auto-routes by filename: `nuvei`/`us_ppi_commission_report` → Nuvei, `reseller residual detail` → CheckCommerce, `vendara`/`global payments` → Vendara data, `commissions.xlsx` (exact) → Vendara template |
| Nuvei processing | Strips Total row, applies 10bp formula to NUVIA rows only, appends offset row (MID 999911110000) |
| CheckCommerce processing | Unmerges, trims header/footer rows, removes trailing empty columns |
| Vendara processing | Reorders columns to match Commissions.xlsx template, renames Expense/Recovery → Expense, appends Paramount row |
| Output | Single `.xlsx` with three tabs: Nuvei, CheckCommerce, Vendara |
| Database | Upserts into Supabase project `xqzerfzlisvqcgatpeyv` (CandidPortal). Conflict resolution on `(period, mid)` or `(period, merchant_mid)` — re-running same month updates rather than duplicates |

---

## No Changes Needed To

- Supabase schema (tables already created)
- Auth/RLS policies (already configured)
- Any existing Commissions tab logic (only the blank "Upload New" view is replaced)

