/**
 * Deep commissions system knowledge for admin Hank.
 * Source of truth: agent-commission-engine.ts, workflow-status.ts, commission-match.ts, etc.
 */
export const HANK_COMMISSIONS_KNOWLEDGE = `
## COMMISSIONS SYSTEM KNOWLEDGE (authoritative — you have this; do not claim you lack it)

You fully understand Candid's monthly commissions pipeline. Combine this with database queries for live counts. Key code: src/lib/commissions/agent-commission-engine.ts, workflow-status.ts, src/lib/bmw/commission-match.ts, CommissionsView.tsx.

### Monthly workflow (5 steps — order matters)
1. **Bank Deposits** — Chase import → bank_deposit_lines matched to partner_suppliers. Posting month ≠ commission period (deposits arrive ~1 month after commission month; commission_period offset applied). Expense-type lines sync to admin_expenses.
2. **Supplier Reports** — Commission rows from Supabase supplier tables + manual_commission_imports + browser manual imports. Reconcile each supplier total to bank deposit (tolerance $0.02). Fix unmatched rows via New Deal(s). Zero-total suppliers → Manual upload.
3. **Expenses** — admin_expenses with commission_review_status: pending | included | rejected | deferred. Must be included or deferred before agent step completes.
4. **Agent Payments** — agent-commission-engine builds payout rows, then expense deductions, then reconciliation adjustments. Mark paid in candid-agent-payouts (localStorage).
5. **Team Payouts** — internal-commission-engine.ts: house net = max(0, gross supplier amount − total agent paid on deal).

### Supplier import tables (period column YYYY-MM, amount per supplier-config)
paymentcloud (PaymentCloud, Partner Comm, MID), payjunction, appdirect, cardconnect, intelisys, telarus, sandlerpartners, nuvei, checkcommerce (total, mid), vendara, mango_commissions, weave_commissions. Config: src/lib/commissions/supplier-config.ts.

Manual imports: localStorage candid-manual-commission-imports + table manual_commission_imports. Manual batch id manual-{supplier}-{period} **wins** over DB totals in supplierPeriodTotals().

### Deal master & agent rates (Postgres)
- bmw_deals — deal_uid, merchant, pay_source, agent_comm_id, deal_data jsonb (providerAccount, serviceId, uuid, activeDeal, etc.)
- bmw_agent_rates — agent_comm_id, rate_data jsonb (name, email, commissionRate, overridePartner, overrideRate, tempRate, tempRateEndDate)

Deal key: paySource::normalizeUid(dealUid). normalizeUid lowercases, strips Excel .0 suffix.

### Period snapshots (localStorage candid-bmw-period-snapshots)
Freezes agent assignment and commission rate **per period**. agentCommIdForDeal(deal, period) uses snapshot first, then live deal.agentCommId. Historical months do not retroactively change unless snapshot was never created (then new keys backfill only). syncCurrentPeriodSnapshot updates **current period only** when deal master hash changes.

### Added deals (localStorage candid-added-deals)
Rows matched via New Deals modal before/full bmw_deals persist. persistCommissionDeal → added deals + bmw_deals + customer account.

### How a supplier row becomes an agent payment line
**matchPeriodRows** (per import batch for selected period):
1. matchDealToCommissionRow(supplier, row) — index key supplier::normalizedUid from MID/account fields per SUPPLIER_MATCH_FIELDS; fallback merchant name (Telarus/Sandler); fallback added deals; fallback scan all cells on manual uploads.
2. supplierAmount = commissionRowAmountForBatch (configured amount column).
3. pushMatchedLine — SKIP if: payout excluded, supplierAmount === 0.
4. agentCommId = agentCommIdForDeal(deal, period) || addedDeal.agentCommId || deal.agentCommId.
5. isAgentPayableForPeriod — inactive agents get $0 payout (shown as Candid Solutions).
6. ratePct = addedDeal.commissionRate ?? commissionRateForAgent(agentCommId, period) [tempRate if tempRateEndDate >= today].
7. agentPayout = round(supplierAmount × ratePct / 100, 2).
8. overridePayoutLinesForDeal may add partner override lines (one supplier row → multiple agent lines).
9. Verified pay-source lines (candid-verified-pay-source-commissions) added for deposit-only sources with no Supabase table.

**aggregateAgentRows** — SKIP line if: !agentCommId.trim() OR |agentPayout| <= 0.001. Agents merged by resolveAgentMergeKey (email > name > agentCommId).

**Post-processing on agent rows:**
- applyExpenseDeductionsToAgentRows (expense-review.ts) — customer/agent_fee/charge_and_reimburse allocations
- applyReconciliationToAgentRows (supplier-reconciliation.ts) — supplier_period_adjustments

currentMonthOwed = sum of customer line payouts after deductions/adjustments.

### WHY SUPPLIER REPORT COUNTS ≠ AGENT PAYMENT COUNTS (critical)
| Supplier reports show | Agent payments show |
|---|---|
| ALL import rows for period | Only **matched** rows with deal master link |
| Rows with $0 commission amount | Skipped at pushMatchedLine |
| Unmatched rows (no deal) | No line — drives New Deal(s) badge |
| Rows attributed to agent via report display | Only rows with agentPayout > $0.001 after rate |
| Inactive agent → still counted in supplier UI | $0 payout → **excluded** from agent table |
| 0% rate or inactive → row visible | Rounded to $0 → excluded |
| Payout exclusions (escalation) | isDealExcludedFromPayout skips deals |
| One row per commission line | Override partners add extra lines; mergeKey combines agentCommIds |
| Single period tab | Verified pay-source lines may exist without supplier table rows |
| Mango/Weave projected rows (_projected) | Same if matched, but projections inflate supplier counts |

**Example:** CheckCommerce 60 rows for Gret, 54 matched to deals, 49 in Agent Payments → typically 5 rows with $0 payout (inactive, 0% rate, or zero total) or 6 unmatched + 5 zero payout. Query checkcommerce_commissions + bmw_deals + bmw_agent_rates to list specifics.

### Supplier report agent attribution (UI/export)
resolveAgentCommIdForCommissionRow: deal-master agent for period via agentCommIdForDeal, else rep columns on row (agent_name, rep, etc.). CheckCommerce has no rep column — almost all attribution from MID → deal master.

### Bank deposit reconciliation
reconciledSupplierTotal = importTotal + sum(supplier_period_adjustments.amount). Tolerance $0.02. Variance resolution types: candid_absorb, candid_revenue, agent_charge, agent_pro_rata, agent_bonus.

### Payout exclusions (escalation)
candid-payout-exclusions — excludeSupplierPayout() when commission underpaid vs deposit. Excluded deals skip agent engine. Workflow treats as resolved.

### Underpaid detection
commissionUnderpaid: hasImport && commissionTotal > 0.02 && (commissionTotal - depositTotal) > 0.02.

### Expense commission fields
commission_review_status, commission_allocation_type (customer | agent_fee | internal_reimburse | internal_partner | charge_and_reimburse), commission_customer_ids, commission_agent_id, commission_charge_amount/mode.

### Pay source mapping
PaymentCloud, Payjunction, CardConnect_Commissions, AppDirect, Intelisys, Telarus, Sandler Partners, Nuvei, CheckCommerce, Vendara, Mango, Weave → supplier ids in pay-source-map.ts.

### localStorage keys
candid-bmw-period-snapshots, candid-bmw-master-hash, candid-manual-commission-imports, candid-verified-pay-source-commissions, candid-payout-exclusions, candid-agent-payouts, candid-agent-commission-overrides, candid-added-deals, candid-workflow-expenses-complete. Refresh event: candid-commissions-updated.

### Troubleshooting playbook
- **Missing deals in agent payments:** Check unmatched (New Deals), dealUid/MID normalization, pay_source mapping, payout exclusion, inactive agent, zero amount.
- **Wrong agent on row:** Check period snapshot for that month, not current bmw_deals.agent_comm_id.
- **Deposit ≠ supplier total:** commission_period offset, manual import overriding DB, need reconciliation adjustment or verify flow for deposit-only sources.
- **Wrong rate historical month:** Period snapshot frozen; check candid-bmw-period-snapshots.
- **Mango/Weave inflated:** Projected recurring rows until actual import arrives.

When answering commissions questions: explain which filter/step explains the discrepancy, cite counts, suggest the exact UI action (New Deal, Manual upload, Reconcile variance, Escalate/exclude, mark expenses included).
`.trim();

/** Include commissions knowledge when the admin screen context is commissions-related. */
export function hankPromptNeedsCommissionsKnowledge(systemPrompt: string): boolean {
  return /View:\s*Commissions|View:\s*Expenses|commissions tab|supplier reports|agent payments/i.test(
    systemPrompt,
  );
}
