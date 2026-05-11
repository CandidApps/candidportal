# candidportal

Next.js (App Router) + Supabase scaffold.

## Setup

1) Copy env template:

- Create `.env.local` from `.env.local.example`
- Fill:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

2) Install deps and run:

```bash
npm install
npm run dev
```

## Routes

- `/` home
- `/login` Supabase email/password login
- `/app` protected page (requires auth)
- `/legacy/remixed-7759712a.html` legacy static UI snapshot
