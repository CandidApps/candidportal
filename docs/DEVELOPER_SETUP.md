# Developer setup

Coworkers can run the Candid portal against the shared Supabase project without local Excel files, JSON imports, or PDF folders.

## Prerequisites

- Node.js 20+
- Git access to this repository
- Team `.env.local` (ask Bryan for the shared values)

## First-time setup

```bash
git clone https://github.com/CandidApps/candidportal.git
cd candidportal
npm install
```

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with an admin email configured in Supabase.

## What loads from Supabase

At runtime the app reads:

- **Customers, contacts, locations** — `customers` tables
- **Contracts / deals** — `deals` table
- **Documents** — `customer_records` + `candid_documents` Storage bucket
- **BMW deal master** — `bmw_deals` table
- **Agent commission rates** — `bmw_agent_rates` table

No `src/data/bmw/*.json` or `src/data/portal-import/index.json` is required for normal development.

## One-time data import (admin machine only)

Only needed when re-seeding Supabase from source files. Requires local:

- `BMW_Deal_Master_Table.xlsx` + `BMW_Agent_Com_Rates.xlsx`
- `candid_portal_MASTER_import.json` (and optional `DELTA`)
- `candid_portal_all_docs/` folder

```bash
npm run import-bmw      # generates src/data/bmw/*.json (gitignored)
npm run import-portal   # generates src/data/portal-import/index.json (gitignored)
npm run import-bmw-to-supabase  # upserts bmw_deals + bmw_agent_rates only
npm run import-crm      # full CRM re-import + BMW + document uploads
```

## Updating from GitHub

```bash
git pull origin main
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run start
```

Ensure production environment variables match `.env.local` (use your host's secrets manager — never commit keys).

For production deployment on Vercel, see [DEPLOYMENT.md](./DEPLOYMENT.md).
