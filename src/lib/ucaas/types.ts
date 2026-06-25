// UCaaS quoting model. Mirrors the structure of the Vonage "Instant Quote"
// spreadsheet so reps can configure a package (one-time setup + monthly add-ons),
// apply fee/tax rules, and produce a savings figure vs. the customer's current spend.

export type UcaasItemSection = 'setup' | 'monthly';

/** A catalog line item (product / add-on) a rep can include in a quote. */
export type UcaasCatalogItem = {
  id: string;
  section: UcaasItemSection;
  name: string;
  description?: string;
  /** Default unit price (negative for discounts / comps). */
  unitPrice: number;
  /** Default quantity when a fresh quote is built from the catalog. */
  defaultQuantity: number;
  /** Flat line: subtotal = unitPrice regardless of quantity (e.g. activation discount). */
  flat?: boolean;
  /** Allow editing quantity in the builder (default true). */
  quantityEditable?: boolean;
  /** Allow editing unit price in the builder (default true). */
  priceEditable?: boolean;
};

/** A computed fee driven by the quantities of specific catalog items. */
export type UcaasCatalogFee = {
  id: string;
  name: string;
  section: UcaasItemSection;
  /** Amount = perUnit * sum(quantity of each driverItemId present in the quote). */
  perUnit: number;
  driverItemIds: string[];
};

export type UcaasTaxConfig = {
  /** Flat monthly tax estimate applied to the monthly subtotal (e.g. 35). */
  monthlyTaxRatePct: number;
  /** Labels for manual one-time setup tax lines the rep fills in per quote. */
  setupTaxLabels: string[];
};

export type UcaasCatalog = {
  items: UcaasCatalogItem[];
  fees: UcaasCatalogFee[];
  tax: UcaasTaxConfig;
};

export type UcaasCatalogRecord = {
  id: string;
  providerId: string;
  providerDbId?: number;
  providerName: string;
  name: string;
  catalog: UcaasCatalog;
  isDefault: boolean;
  updatedAt?: string;
};

// ----- Configured quote (per customer) -----

export type UcaasQuoteLine = {
  itemId: string;
  section: UcaasItemSection;
  name: string;
  quantity: number;
  unitPrice: number;
  flat?: boolean;
};

export type UcaasQuoteTaxLine = {
  label: string;
  amount: number;
};

/** The configured, customer-facing UCaaS quote stored in the published snapshot. */
export type UcaasQuoteSnapshot = {
  catalogId?: string;
  catalogName?: string;
  providerName: string;
  lines: UcaasQuoteLine[];
  fees: UcaasCatalogFee[];
  setupTaxes: UcaasQuoteTaxLine[];
  monthlyTaxRatePct: number;
  currentMonthlySpend: number;
  savedAt?: string;
};

export const UCAAS_QUOTE_TERM_MONTHS = 12;
