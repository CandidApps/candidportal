/** Curated schema notes for Hank — supplement information_schema discovery. */
export const HANK_DB_SCHEMA_HINTS = `
## Key tables (public schema)

### CRM / accounts
- customers — account records (external_id, company, agent, status, spend, savings, portal_data jsonb)
- customer_locations — locations per account (customer_id uuid, external_id, street, city, state, zip, is_primary)
- customer_contacts — contacts (customer_id, name, email, phone, is_primary)
- deals — CRM contracts/deals per account (customer_id, deal_data jsonb, provider, status)
- customer_records — uploaded files metadata (customer_id, kind, file_name)
- customer_documents — document metadata

### Commissions — supplier import rows (one table per supplier)
- checkcommerce_commissions — CheckCommerce (period, mid, company_dba, company_name, total)
- paymentcloud, appdirect, cardconnect, payjunction, intelisys, telarus, sandlerpartners, nuvei, vendara, mango_commissions, weave_commissions
- manual_commission_imports — manual uploads (supplier, period, rows jsonb, amount_field)
- verified_pay_source_commissions — deposit-only verify amounts (Candid/TekSystems/CorpIT/Linked2Pay; source_key, period, lines jsonb)
- supplier_period_adjustments — reconciliation adjustments per period

### Commissions — deal master & agents
- bmw_deals — deal master (deal_uid, merchant, pay_source, agent_comm_id, deal_data jsonb)
- bmw_agent_rates — agent profiles (agent_comm_id, rate_data jsonb with name, email, rates)

### Leads & quotes
- portal_leads — inbound leads
- quote_requests — quote requests (crm_customer_id, status, company, contact fields)

### Partners / suppliers / vendors (Partners tab)
- solution_providers — supplier & vendor catalog (id, name, display_name, slug). This is where GoTo, RingCentral, etc. live.
- solution_provider_contacts — contacts for those partners (provider_id, name, email, phone, role, is_primary)
- Do NOT confuse with partner_suppliers — that table is only commission/bank-deposit partners (PaymentCloud, CheckCommerce, …) and often lacks product vendors.

### Action center
- customer_service_tickets — support tickets
- member_review_requests — member review queue
- bill_analysis_reviews — bill analysis queue
- customer_reminders — reminders

### Agent payments context (app logic, not separate tables)
Supplier Reports counts ALL commission import rows attributed to an agent (via deal master MID match or rep column).
Agent Payments only includes rows that: (1) match deal master, (2) have positive supplier amount, (3) have positive agent payout after rates and inactive-agent filtering.
Discrepancies: unmatched rows, $0 amounts, inactive agents, 0% rates, payout exclusions, override partner splits, verified pay-source lines, manual batch overrides, Mango/Weave projections.
Key tables: checkcommerce_commissions, bmw_deals, bmw_agent_rates, manual_commission_imports, supplier_period_adjustments, bank_deposit_lines, admin_expenses.

### JSONB tips
- bmw_deals.deal_data and bmw_agent_rates.rate_data hold nested fields — use deal_data->>'field' or rate_data->>'name' in SQL.
- customers.portal_data, deals.deal_data — same pattern.

Always filter commission tables by period (text YYYY-MM) when comparing counts for a specific month.
`.trim();
