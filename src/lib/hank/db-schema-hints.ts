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
- supplier_period_adjustments — reconciliation adjustments per period

### Commissions — deal master & agents
- bmw_deals — deal master (deal_uid, merchant, pay_source, agent_comm_id, deal_data jsonb)
- bmw_agent_rates — agent profiles (agent_comm_id, rate_data jsonb with name, email, rates)

### Leads & quotes
- portal_leads — inbound leads
- quote_requests — quote requests (crm_customer_id, status, company, contact fields)

### Action center
- customer_service_tickets — support tickets
- member_review_requests — member review queue
- bill_analysis_reviews — bill analysis queue
- customer_reminders — reminders

### Agent payments context (app logic, not separate tables)
Supplier Reports counts ALL commission import rows attributed to an agent (via deal master MID match or rep column).
Agent Payments only includes rows that: (1) match deal master, (2) have positive supplier amount, (3) have positive agent payout after rates.
Discrepancies often come from unmatched rows, $0 amounts, inactive agents, or 0% commission rates.

### JSONB tips
- bmw_deals.deal_data and bmw_agent_rates.rate_data hold nested fields — use deal_data->>'field' or rate_data->>'name' in SQL.
- customers.portal_data, deals.deal_data — same pattern.

Always filter commission tables by period (text YYYY-MM) when comparing counts for a specific month.
`.trim();
