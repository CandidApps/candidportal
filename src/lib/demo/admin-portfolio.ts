/** Demo portfolio data for admin dashboard (until wired to Supabase). */

export type DemoAgentRow = {
  id: string;
  company: string;
  customerCount: number;
  commissionsLastMonth: number;
  commissionsYtd: number;
  dealsClosedQtd: number;
};

export const DEMO_AGENTS: DemoAgentRow[] = [
  { id: 'ag-vertex', company: 'Vertex Sales Agency', customerCount: 62, commissionsLastMonth: 15620, commissionsYtd: 112400, dealsClosedQtd: 14 },
  { id: 'ag-payments-pro', company: 'Payments Pro Partners', customerCount: 47, commissionsLastMonth: 12840, commissionsYtd: 89420, dealsClosedQtd: 11 },
  { id: 'ag-summit', company: 'Summit Payment Brokers', customerCount: 38, commissionsLastMonth: 9920, commissionsYtd: 67850, dealsClosedQtd: 9 },
  { id: 'ag-midwest-iso', company: 'Midwest ISO Group', customerCount: 31, commissionsLastMonth: 7150, commissionsYtd: 52180, dealsClosedQtd: 7 },
  { id: 'ag-coastal', company: 'Coastal Merchant Advisors', customerCount: 4, commissionsLastMonth: 890, commissionsYtd: 2340, dealsClosedQtd: 2 },
  { id: 'ag-lakeside', company: 'Lakeside Agent Network', customerCount: 8, commissionsLastMonth: 0, commissionsYtd: 4180, dealsClosedQtd: 0 },
];

export const DEMO_COMMISSION_TREND = [
  { month: 'Nov', amount: 38200 },
  { month: 'Dec', amount: 41100 },
  { month: 'Jan', amount: 42850 },
  { month: 'Feb', amount: 44120 },
  { month: 'Mar', amount: 45890 },
  { month: 'Apr', amount: 47420 },
] as const;

export type DemoNewCustomer = {
  id: string;
  company: string;
  agent: string;
  mrc: number;
  signedAt: string;
};

export const DEMO_NEW_CUSTOMERS: DemoNewCustomer[] = [
  { id: 'nc-1', company: 'Harbor Bistro Group', agent: 'Vertex Sales Agency', mrc: 2840, signedAt: '2026-04-28' },
  { id: 'nc-2', company: 'Northline Dental', agent: 'Payments Pro Partners', mrc: 1920, signedAt: '2026-04-22' },
  { id: 'nc-3', company: 'Summit Auto Parts', agent: 'Summit Payment Brokers', mrc: 1650, signedAt: '2026-04-18' },
  { id: 'nc-4', company: 'Lakeview Fitness', agent: 'Midwest ISO Group', mrc: 980, signedAt: '2026-04-12' },
  { id: 'nc-5', company: 'Prairie Home Goods', agent: 'Vertex Sales Agency', mrc: 1240, signedAt: '2026-04-08' },
];

export type DemoStatementPreview = {
  processor: string;
  statementDate: string;
  totalVolume: number;
  totalFees: number;
  effectiveRate: number;
  highlights: string[];
};

export type DemoStatementReview = {
  id: string;
  customerName: string;
  customerEmail: string;
  merchantName: string;
  fileName: string;
  createdAt: string;
  status: 'open' | 'in_progress';
  statementPreview: DemoStatementPreview;
};

export function getDemoStatementReview(id: string): DemoStatementReview | undefined {
  return DEMO_STATEMENT_REVIEWS.find((s) => s.id === id);
}

export const DEMO_STATEMENT_REVIEWS: DemoStatementReview[] = [
  {
    id: 'stmt-review-1',
    customerName: 'Harbor Bistro Group',
    customerEmail: 'ops@harborbistro.com',
    merchantName: 'Harbor Bistro — Main',
    fileName: 'March_2026_processing.pdf',
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    status: 'open',
    statementPreview: {
      processor: 'Fiserv / Clover',
      statementDate: '03/2026',
      totalVolume: 284500,
      totalFees: 6842,
      effectiveRate: 2.4,
      highlights: [
        'PCI non-compliance fee ($19.95) — confirm SAQ status',
        'Monthly minimum not met — $25 assessment',
        'Effective rate 40 bps above portfolio average',
      ],
    },
  },
  {
    id: 'stmt-review-2',
    customerName: 'Northline Dental',
    customerEmail: 'billing@northlinedental.com',
    merchantName: 'Northline Dental PLLC',
    fileName: 'Q1_2026_merchant_statement.pdf',
    createdAt: new Date(Date.now() - 9 * 3600000).toISOString(),
    status: 'open',
    statementPreview: {
      processor: 'Worldpay',
      statementDate: '03/2026',
      totalVolume: 412000,
      totalFees: 11240,
      effectiveRate: 2.73,
      highlights: [
        'Chargeback ratio elevated (0.42%)',
        'Statement mail fee present — paperless eligible',
        'Amex pass-through appears mis-coded on 3 line items',
      ],
    },
  },
  {
    id: 'stmt-review-3',
    customerName: 'Acme Corporation',
    customerEmail: 'john@acmecorp.com',
    merchantName: 'Acme Corp Retail',
    fileName: 'April_2026_square_export.pdf',
    createdAt: new Date(Date.now() - 26 * 3600000).toISOString(),
    status: 'in_progress',
    statementPreview: {
      processor: 'Square',
      statementDate: '04/2026',
      totalVolume: 98400,
      totalFees: 2768,
      effectiveRate: 2.81,
      highlights: [
        'Instant deposit fee recurring — review cash-flow needs',
        'Card-present mix 62% — IC+ may beat flat rate',
      ],
    },
  },
];

export function sumAgentCommissions(agents: DemoAgentRow[], field: 'commissionsLastMonth' | 'commissionsYtd') {
  return agents.reduce((n, a) => n + a[field], 0);
}

export function formatAdminCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}
