import { detectServiceType, type ServiceProfileKey } from "@/lib/candid-data";

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
  pending: boolean;
  amount?: string;
  exp?: string;
  expTxt?: string;
  expSub?: string;
  filter: string[];
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

export function accountServiceToCard(row: AccountServiceRow): ServiceCardModel {
  const logo = row.logo_key in LOGO_INITIALS ? row.logo_key : "msp";
  const pending = row.status === "pending_analysis";

  if (pending) {
    return {
      id: row.id,
      cls: "candid-svc",
      logo,
      logoTxt: LOGO_INITIALS[logo] ?? "SV",
      name: row.name,
      vendor: row.vendor ?? "Bill submitted for analysis",
      status: "pending",
      statusTxt: "Pending Analysis",
      badge: "candid",
      pending: true,
      filter: ["candid"],
    };
  }

  const { exp, expTxt, expSub } = formatExpires(row.expires_at);
  const status = row.status === "expiring" ? "expiring" : row.status === "external" ? "external" : "active";
  const statusTxt =
    status === "expiring"
      ? "Expiring Soon"
      : status === "external"
        ? "External"
        : "Active";

  const filter: string[] = [];
  if (status !== "external") filter.push("candid");
  else filter.push("external");
  if (status === "expiring") filter.push("expiring");

  return {
    id: row.id,
    cls: status === "external" ? "external-svc" : "candid-svc",
    logo,
    logoTxt: LOGO_INITIALS[logo] ?? "SV",
    name: row.name,
    vendor: row.vendor ?? "",
    status,
    statusTxt,
    badge: status === "external" ? "external" : "candid",
    pending: false,
    amount: formatMonthly(row.monthly_amount_cents),
    exp,
    expTxt,
    expSub,
    filter,
  };
}
