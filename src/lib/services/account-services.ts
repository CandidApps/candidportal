import type { BillParseResult, PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import { detectServiceType, type ServiceProfileKey } from '@/lib/candid-data';
import {
  merchantVendorSummary,
  type MerchantAnalysisSnapshot,
} from '@/lib/candid-pay/merchant-analysis';
import { resolveSupplierLogo } from '@/lib/supplier-logos';

export type AccountServiceStatus =
  | "pending_analysis"
  | "active"
  | "expiring"
  | "external";

export type AccountServiceRow = {
  id: string;
  user_id: string;
  name: string;
  vendor: string | null;
  status: AccountServiceStatus;
  monthly_amount_cents: number | null;
  expires_at: string | null;
  logo_key: string;
  bill_storage_path: string | null;
  service_type: string | null;
  merchant_analysis: MerchantAnalysisSnapshot | null;
  analysis_snapshot: PublishedAnalysisSnapshot | null;
  analysis_review_id: string | null;
  /** When false, service is member-tracked external vendor (savings opportunities upload). */
  candid_managed: boolean;
  /** When true, bill upload lives on My Savings Opportunities until member adds it to My Services */
  savings_opportunity_only: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceCardModel = {
  id: string;
  cls: string;
  logo: string;
  logoTxt: string;
  name: string;
  vendor: string;
  status: string;
  statusTxt: string;
  badge: "candid" | "external" | null;
  /** Candid-managed contracts/services — members cannot remove these. */
  candidManaged: boolean;
  pending: boolean;
  amount?: string;
  exp?: string;
  expTxt?: string;
  expSub?: string;
  filter: string[];
  /** Pending bill review — parsed category while awaiting admin */
  pendingParseResult?: BillParseResult;
  pendingCategories?: string[] | null;
  /** Member portal: service location label */
  locationLabel?: string;
  /** Member portal: formatted service address */
  locationAddress?: string;
  /** Underlying admin contract id (portal-managed services) */
  contractId?: string;
  /** Link to contract / agreement PDF when available */
  documentUrl?: string | null;
  documentFilename?: string;
  /** Opens savings analysis when published (merchant processing) */
  merchantAnalysis?: MerchantAnalysisSnapshot | null;
  /** Opens admin-uploaded proposal when published (non-merchant categories) */
  analysisSnapshot?: PublishedAnalysisSnapshot | null;
  analysisReviewId?: string | null;
  /** Bill upload listed on My Savings Opportunities only */
  savingsOpportunityOnly?: boolean;
  contractStartDate?: string;
  contractEndDate?: string;
};

const LOGO_INITIALS: Record<string, string> = {
  ringcentral: "RC",
  comcast: "CB",
  square: "SQ",
  microsoft: "MS",
  msp: "SV",
  external: "EX",
};

export function serviceTypeToLogoKey(type: ServiceProfileKey): string {
  const map: Record<ServiceProfileKey, string> = {
    merchant: "square",
    internet: "comcast",
    ucaas: "ringcentral",
    microsoft: "microsoft",
    security: "msp",
    cloud: "msp",
    default: "msp",
  };
  return map[type] ?? "msp";
}

export function logoKeyFromLabel(label: string): string {
  const resolved = resolveSupplierLogo(label);
  if (resolved.key !== 'msp') return resolved.key;
  return serviceTypeToLogoKey(detectServiceType(label));
}

function formatMonthly(cents: number | null): string | undefined {
  if (cents == null) return undefined;
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatExpires(iso: string | null): { exp: string; expTxt: string; expSub: string } {
  if (!iso) return { exp: "", expTxt: "", expSub: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { exp: "", expTxt: "", expSub: "" };
  const expTxt = `Expires ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  return { exp: "ok", expTxt, expSub: "" };
}

export function accountServiceToCard(
  row: AccountServiceRow,
  pendingParse?: BillParseResult,
  pendingCategories?: string[] | null,
  reviewPublishedSnapshot?: PublishedAnalysisSnapshot | null,
): ServiceCardModel {
  const logoInfo = resolveSupplierLogo(row.vendor, row.name);
  const logo = logoInfo.key in LOGO_INITIALS || logoInfo.key !== 'msp' ? logoInfo.key : row.logo_key in LOGO_INITIALS ? row.logo_key : 'msp';
  const logoTxt = logoInfo.initials || LOGO_INITIALS[logo] || 'SV';
  const pending = row.status === "pending_analysis";
  const candidManaged = row.candid_managed !== false;
  const savingsOpportunityOnly = row.savings_opportunity_only === true;
  const isExternal = !candidManaged || row.status === "external";

  if (pending) {
    return {
      id: row.id,
      cls: isExternal ? "external-svc" : "candid-svc",
      logo,
      logoTxt,
      name: row.name,
      vendor: row.vendor ?? "Bill submitted for analysis",
      status: "pending",
      statusTxt: "Pending Analysis",
      badge: isExternal ? "external" : "candid",
      candidManaged,
      pending: true,
      savingsOpportunityOnly,
      filter: isExternal ? ["external"] : ["candid"],
      pendingParseResult: pendingParse,
      pendingCategories: pendingCategories ?? null,
    };
  }

  const snapshot = row.merchant_analysis;
  const analysisSnapshot = row.analysis_snapshot ?? reviewPublishedSnapshot ?? null;
  const published = analysisSnapshot;
  const isMerchant = row.service_type === "merchant" && snapshot;
  const merchantAnalysis =
    isMerchant && snapshot
      ? {
          ...snapshot,
          providerQuotes: snapshot.providerQuotes ?? published?.providerQuotes,
          pricingStructureOptions:
            snapshot.pricingStructureOptions ?? published?.pricingStructureOptions,
          matchedProviderName:
            snapshot.matchedProviderName ?? published?.matchedProviderName,
        }
      : null;
  const hasProposalAnalysis = Boolean(
    analysisSnapshot?.proposalDocument?.storagePath && row.analysis_review_id,
  );

  const { exp, expTxt, expSub } = formatExpires(row.expires_at);
  const status = row.status === "expiring" ? "expiring" : row.status === "external" ? "external" : "active";
  const statusTxt = hasProposalAnalysis
    ? "Analysis Ready"
    : status === "expiring"
      ? "Expiring Soon"
      : status === "external"
        ? "External"
        : "Active";

  const filter: string[] = [];
  if (isExternal) filter.push("external");
  else filter.push("candid");
  if (status === "expiring") filter.push("expiring");

  return {
    id: row.id,
    cls: isExternal ? "external-svc" : "candid-svc",
    logo,
    logoTxt,
    name: row.name,
    vendor: isMerchant ? merchantVendorSummary(snapshot) : (row.vendor ?? ""),
    status,
    statusTxt,
    badge: isExternal ? "external" : "candid",
    candidManaged,
    pending: false,
    savingsOpportunityOnly,
    amount: formatMonthly(row.monthly_amount_cents),
    exp,
    expTxt,
    expSub,
    filter,
    merchantAnalysis,
    analysisSnapshot: hasProposalAnalysis ? analysisSnapshot : null,
    analysisReviewId: row.analysis_review_id,
  };
}
