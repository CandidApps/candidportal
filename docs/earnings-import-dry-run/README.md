# Provider Rates import — local dry run

**Status:** Dry run only — SQL under `earnings_dry_run` schema. **Do not apply to production** until CR-0036 / CR-0035 accept a real migration path.  
**Source:** `Suppliers_Final.xlsx` → sheet `Provider Rates` (repo root, updated 2026-09-21)  
**Related:** CR-0035 (SPIFF import), CR-0036 (catalog build), CR-0001 (cash back UX), CR-0014 (profile fallback), `docs/CandidIQ-MEMBER-EARNINGS-SPIFF-ARCHITECTURE.md`

## What’s in the workbook now

| Sheet | Role |
|---|---|
| **Provider Rates** | Residual rate book + partner portfolio + term columns Q–AC |
| SPIFFS - Incentives | Separate campaign import (not in this dry run) |
| PartnerStack | Referral offers (not in this dry run) |
| Consolidated SPIFFS | Cleaned SPIFF view (not in this dry run) |

Provider Rates snapshot from this generate:

- **~3,418** product rows (was ~2,174 in the architecture note — sheet grew)
- **~831** unique providers
- Gross filled on almost all rows (huge improvement vs older ~352 missing)
- Partner **Supported?** still: Intelisys / Sandler / Telarus / AppDirect / AppDirect SaaS
- **New since architecture doc:** columns **Q–AC** partner commission *terms* (Sandler / Telarus / Intelisys only — **AppDirect has no term columns** in this file)

## Files

| File | Purpose |
|---|---|
| `00_schema.sql` | Creates `earnings_dry_run` schema + tables |
| `01_providers.sql` | Inserts unique providers/vendors |
| `02_commission_products.csv` | Full product rows (consolidated terms + raw jsonb) |
| `02_commission_products_copy.sql` | `\copy` loader for the CSV |
| `02a_commission_products_sample_25.sql` | First 25 rows as plain `INSERT` for eyeballing |
| `TERM_CONSOLIDATION.md` | How Q–AC map into shared fields |

## See it in the local app

1. Ensure rows are loaded: `python3 scripts/load-earnings-dry-run.py`
2. Open **Partners → Suppliers & Vendors → [supplier] → Provider Rates** tab

(Dry-run catalog is scoped to that supplier; Overview still shows legacy Solutions & commission rates until CR-0036 replaces them.)
