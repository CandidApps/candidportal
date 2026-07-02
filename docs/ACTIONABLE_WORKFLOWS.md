# Actionable Customer Workflows

Every customer submission in the Candid portal must follow a closed loop: **intake → admin work → deliverable → customer notification**. Bill analysis (`bill_analysis_reviews`) is the gold standard.

## Required capabilities (all submission types)

| # | Capability | Bill analysis (reference) | Quote request | Service ticket | Review request |
|---|------------|---------------------------|---------------|----------------|----------------|
| 1 | Intake acknowledgment | Message Center thread on confirm | Message Center thread on submit | Notification on status | Notification on status |
| 2 | Action Center ticket | `analysis_review` | `quote_request` | `service` | `review_request` |
| 3 | Rich admin workspace | `AnalysisReviewDetailPanel` | `QuoteRequestDetailPanel` | Reply composer in detail panel | Reply composer in detail panel |
| 4 | Structured deliverable | `published_snapshot` | `published_quote_snapshot` | `replyMessage` + optional publish note | `replyMessage` + findings |
| 5 | Publish action | PATCH with `publish: true` | PATCH with `publish: true` | Status + reply | Status + reply |
| 6 | Customer read path | My Services / proposal views | `MemberQuoteProposal` | Message Center + Alerts | Alerts |
| 7 | Supplier path (when needed) | Schedule A / UCaaS catalog | Submit to Supplier RFQ | Zoho to vendor | N/A |
| 8 | Audit trail | Team notes, assignees | Team notes + `quote_supplier_rfqs` | Team notes | Team notes |

## Gold-standard publish loop

```
Customer submits
  → source row created (status: open)
  → member_notifications + optional Message Center thread
Admin opens Action Center
  → assign / claim / team notes
  → work in dedicated panel (draft snapshot)
  → optional Submit to Supplier (separate emails per supplier)
Admin publishes deliverable
  → published_*_snapshot written, status → resolved
  → deliverMemberNotification (in-app + email)
Customer opens Alerts bell or dedicated viewer
```

## Key files

- Unification: `src/lib/admin-tickets.ts`
- Analysis reference: `src/components/admin/AnalysisReviewDetailPanel.tsx`, `src/app/api/admin/analysis-reviews/[id]/route.ts`
- Quote workflow: `src/components/admin/QuoteRequestDetailPanel.tsx`, `src/app/api/admin/quote-requests/[id]/route.ts`
- Notifications: `src/lib/notifications/member-notification-deliver.ts`
- Supplier RFQ: `src/lib/quotes/rfq-template.ts`, `src/components/admin/SubmitToSupplierModal.tsx`
- Customer inbox (admin): `src/components/admin/AdminCustomerInboxView.tsx`

## Portal-wide rule (moving forward)

Before shipping any new customer-facing submit action, verify:

1. Action Center kind exists or is added to `buildUnifiedAdminTickets`
2. Admin can compose a deliverable (not only change status)
3. Customer receives in-app notification with deep-link
4. Email respects notification preferences
5. Supplier relay exists when instant pricing is unavailable
