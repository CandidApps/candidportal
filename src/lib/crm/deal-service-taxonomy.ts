/** Generated from Deal_Service_Fields_Payments_Standardized-1.xlsx (Deals sheet). */

export type DealBaseService = typeof DEAL_BASE_SERVICES[number];

export const DEAL_BASE_SERVICES = [
  "Cloud / SaaS",
  "Communications",
  "Connectivity",
  "Managed Services",
  "Mobility",
  "Other",
  "Payment Solutions",
  "SD-WAN",
  "Security",
  "Web Services"
] as const;

export const DEAL_SERVICE_DETAILS_BY_BASE: Record<DealBaseService, readonly string[]> = {
  "Cloud / SaaS": ["Other","SaaS Subscription"],
  "Communications": ["Call Center Software","Internet, UCaaS","POTS Lines","SaaS Subscription","UCaaS"],
  "Connectivity": ["Internet","Internet, SD-WAN","Internet, SecurityEdge","Internet, Voice"],
  "Managed Services": ["IT Support"],
  "Mobility": ["Mobility"],
  "Other": ["Bonus","Charity Sponsorship","Energy","Grid","IT Support","Master Service Agreement","SPIFF","Support"],
  "Payment Solutions": ["ACH Payments","CC Payments","POS / Payment Processing (2nd unit)"],
  "SD-WAN": ["SD-WAN"],
  "Security": ["SaaS Subscription","Security"],
  "Web Services": ["Candid Hosting","Website"],
};

export const DEAL_SERVICE_DETAILS = [
  "ACH Payments",
  "Bonus",
  "CC Payments",
  "Call Center Software",
  "Candid Hosting",
  "Charity Sponsorship",
  "Energy",
  "Grid",
  "IT Support",
  "Internet",
  "Internet, SD-WAN",
  "Internet, SecurityEdge",
  "Internet, UCaaS",
  "Internet, Voice",
  "Master Service Agreement",
  "Mobility",
  "Other",
  "POS / Payment Processing (2nd unit)",
  "POTS Lines",
  "SD-WAN",
  "SPIFF",
  "SaaS Subscription",
  "Security",
  "Support",
  "UCaaS",
  "Website"
] as const;

export function serviceDetailsForBase(base: string): readonly string[] {
  const key = base.trim();
  if (!key) return [];
  return (DEAL_SERVICE_DETAILS_BY_BASE as Record<string, readonly string[]>)[key] ?? [];
}
