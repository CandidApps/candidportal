# Deploying to Vercel + Supabase

Production stack:

```
Browser → Vercel (Next.js UI + API routes)
              ↓
         Supabase (Postgres, Auth, Storage)
```

Supabase stays your database, auth, and document storage. Vercel runs the app.

---

## 1. Connect Vercel to GitHub

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Add New Project** → import `CandidApps/candidportal`.
3. Framework preset should auto-detect **Next.js**.
4. Leave build settings as defaults:
   - **Build command:** `npm run build`
   - **Output:** Next.js (automatic)
   - **Install command:** `npm install`
5. Do **not** deploy yet — add environment variables first.

---

## 2. Environment variables (Vercel)

In the Vercel project: **Settings → Environment Variables**.

Add these for **Production** (and **Preview** if you want preview deploys to work):

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | From Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key (safe in browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Server only** — CRM bootstrap, document downloads, admin APIs |
| `ANTHROPIC_API_KEY` | Yes | Hank chat, statement parsing, document parsing |
| `ADMIN_BOOTSTRAP_SECRET` | Optional | Only if you use `/api/admin/bootstrap` |
| `NEXT_PUBLIC_PORTAL_INVITES_ENABLED` | Optional | Set to `true` to send portal invite emails |
| `DIALPAD_API_KEY` | Optional | Company API key — enables call history/recaps in MyAssistant |
| `DIALPAD_API_BASE` | Optional | Defaults to `https://dialpad.com` (use sandbox URL for testing) |
| `ZOHO_TOKEN_ENC_KEY` | Yes if using Zoho token encryption | 32-byte hex key for encrypting Zoho tokens |

Copy values from your team `.env.local`. Never commit secrets to Git.

---

## 3. Configure Supabase Auth for production

In **Supabase Dashboard → Authentication → URL Configuration**:

| Setting | Value |
|---------|--------|
| **Site URL** | `https://your-app.vercel.app` (or your custom domain) |
| **Redirect URLs** | Add both: |
| | `https://your-app.vercel.app/auth/callback` |
| | `https://your-app.vercel.app/**` |

Magic links and OAuth redirects will fail if these are missing or still point at `localhost:3000`.

After adding a **custom domain** in Vercel, update Site URL and Redirect URLs to match.

---

## 4. Deploy

1. Click **Deploy** (or push to `main` — Vercel auto-deploys on push).
2. Wait for the build to finish (`npm run build` must pass).
3. Open the production URL and sign in with a `@candid.solutions` admin email or a user with `profiles.role = admin`.

---

## 5. Post-deploy checklist

- [ ] Login page loads at `/login`
- [ ] Magic link email arrives and redirects to `/auth/callback` → `/app` or `/admin`
- [ ] Admin shell loads customers from Supabase (Accounts view populated)
- [ ] Document open/download works (Storage + `/api/admin/crm/documents`)
- [ ] Commissions / BMW data loads (requires `bmw_deals` populated in Supabase)
- [ ] Hank / analysis features work (`ANTHROPIC_API_KEY` set)

---

## 6. Custom domain (optional)

1. Vercel → **Settings → Domains** → add e.g. `portal.candid.solutions`.
2. Add the DNS records Vercel shows (usually CNAME).
3. Update Supabase **Site URL** and **Redirect URLs** to the new domain.
4. Redeploy or wait for SSL to provision (usually a few minutes).

---

## 7. What does **not** run on Vercel

These are **one-time admin scripts** — run locally on a machine with source files:

```bash
npm run import-bmw-to-supabase
npm run import-crm
```

They use `SUPABASE_SERVICE_ROLE_KEY` and local Excel/JSON/PDF folders. Data already in Supabase does not need re-import for deploy.

---

## 8. Ongoing updates

```bash
git push origin main   # Vercel auto-deploys
```

Or trigger **Redeploy** from the Vercel dashboard.

---

## 9. Plan / limits to know

| Topic | Note |
|-------|------|
| **Hobby vs Pro** | PDF parsing and AI routes can take several seconds. Hobby functions timeout at ~10s; **Pro** allows longer (up to 60s on many routes). |
| **Service role key** | Only used in server API routes — never prefix with `NEXT_PUBLIC_`. |
| **Preview deployments** | Use the same Supabase project or a separate branch DB; copy env vars to the Preview environment in Vercel. |
| **Storage** | Documents live in Supabase Storage, not on Vercel. |

---

## Quick reference

| Environment | App URL | Backend |
|-------------|---------|---------|
| Local | `http://localhost:3000` | Supabase (shared project) |
| Production | `https://*.vercel.app` or custom domain | Same Supabase project |

See also [DEVELOPER_SETUP.md](./DEVELOPER_SETUP.md) for local dev.
