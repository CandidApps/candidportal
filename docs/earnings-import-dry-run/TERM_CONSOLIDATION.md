# Commission term consolidation (cols Q–AC)

Partners label the same ideas differently. This dry run **does not keep 13 parallel columns as first-class fields**. It keeps:

1. A small set of **shared, queryable terms**
2. **`partner_terms_raw` jsonb** with the original Sandler / Telarus / Intelisys blobs for audit

AppDirect Telco / SaaS only have portfolio + rate columns in this workbook — no term text to merge yet.

## Sheet columns → shared fields

| Sheet column(s) | Shared field | Rationale |
|---|---|---|
| **Sandler Pay on Renewals** + **Note (P)** (initial vs renewal wording) + **Telarus Term** | `pays_on_renewals`, `renewal_scope`, `term_length` | Sandler “Yes, 100% standard rate” ≈ Telarus Term `All` / renewals; Note sometimes says initial-only. One renewal story, not three. |
| **Sandler Commission Method** (`Collected` / `Billed`) + **Intelisys Payment of Commissions** (“after collections” / “after activation”) | `payment_basis` | Same axis: paid on collected cash vs billed/activated. |
| **Telarus Paid On** (`Overall`, `Loop & Port`, one-time, …) + presence of **Sandler Upfront Commissions** | `paid_on_basis`, `upfront_summary` | Telarus encodes *what* is commissionable; Sandler upfront text is the NRC/SOW schedule when present. |
| **Sandler Evergreen Strength** | `evergreen_strength` | Sandler-only taxonomy, but useful portfolio signal (strong / medium / risk / none). Other partners don’t contradict it in-sheet. |
| **Sandler Estimated First Commission** | `first_commission_timing` | Best lag signal in the file (“1 month after invoice/collection”). |
| **Intelisys Commissions Not Paid On** | `exclusions_summary` | Taxes, loops, hardware, etc. Overlaps Sandler notes’ “non-commissionable” lists — Intelisys column is cleaner to store; full Sandler notes stay in jsonb. |
| **Telarus Network** | `partner_network` | Partner-specific SKU/path label (often `n/a`). Kept as one text field, not a parallel Sandler column. |
| **Sandler Commissions Notes** / **Telarus Notes** / Intelisys earning essays | inside `partner_terms_raw` | Long, partner-specific prose. Don’t invent 3× note columns on the product row. |

## Intentionally *not* promoted to columns

- Separate `sandler_*` / `telarus_*` / `intelisys_*` copies of every overlapping idea
- AppDirect term fields (absent from sheet)
- Parsing every Sandler note into structured rate history (effective-date archaeology) — later cleanse pass

## Derived value cheat sheet

**`payment_basis`:** `collected` | `billed` | `other`  
**`paid_on_basis`:** `overall_mrc` | `loop_and_port` | `port_only` | `one_time_upfront` | `one_time_fixed` | `install` | `cpe_mrc` | `has_upfront_schedule` | …  
**`renewal_scope`:** `renewals_at_standard_rate` | `renewals_special_rate` | `no_renewal_pay` | `initial_term_only` | `initial_and_renewal` | …  
**`evergreen_strength`:** `strong` | `medium` | `with_risk` | `none` | `other`

## Example

8x8 Sandler row says method `Collected`, renewals “Yes, 100% standard rate”, evergreen “Strong”; Telarus says Paid On `Overall`, Term `All`.  

Dry-run row stores:

- `payment_basis = collected`
- `pays_on_renewals = true`, `renewal_scope = renewals_at_standard_rate`, `term_length = All`
- `paid_on_basis = overall_mrc`
- `evergreen_strength = strong`
- full originals under `partner_terms_raw.sandler` / `.telarus`
