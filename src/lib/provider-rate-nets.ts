/** Portfolio partners used on Provider Rates (dry-run catalog). */

export type ProviderRatePartnerKey =
  | 'intelisys'
  | 'sandler'
  | 'telarus'
  | 'appdirect_telco'
  | 'appdirect_saas';

export type ProviderRatePartnerDef = {
  key: ProviderRatePartnerKey;
  label: string;
  short: string;
  /** Column on earnings_dry_run_commission_products */
  supportedField:
    | 'intelisys_supported'
    | 'sandler_supported'
    | 'telarus_supported'
    | 'appdirect_supported'
    | 'appdirect_saas_supported';
  netField:
    | 'candid_net_intelisys'
    | 'candid_net_sandler'
    | 'candid_net_telarus'
    | 'candid_net_appdirect_telco'
    | 'candid_net_appdirect_saas';
  /** Match partner_suppliers.name / display_name */
  partnerNameMatchers: string[];
  /** Architecture default Candid share of gross (%) when partner row has no rate */
  defaultSharePct: number;
};

export const PROVIDER_RATE_PARTNERS: ProviderRatePartnerDef[] = [
  {
    key: 'intelisys',
    label: 'Intelisys',
    short: 'Int',
    supportedField: 'intelisys_supported',
    netField: 'candid_net_intelisys',
    partnerNameMatchers: ['intelisys'],
    defaultSharePct: 80,
  },
  {
    key: 'sandler',
    label: 'Sandler',
    short: 'San',
    supportedField: 'sandler_supported',
    netField: 'candid_net_sandler',
    partnerNameMatchers: ['sandler'],
    defaultSharePct: 85,
  },
  {
    key: 'telarus',
    label: 'Telarus',
    short: 'Tel',
    supportedField: 'telarus_supported',
    netField: 'candid_net_telarus',
    partnerNameMatchers: ['telarus'],
    defaultSharePct: 85,
  },
  {
    key: 'appdirect_telco',
    label: 'AppDirect Telco',
    short: 'AD',
    supportedField: 'appdirect_supported',
    netField: 'candid_net_appdirect_telco',
    partnerNameMatchers: ['appdirect'],
    defaultSharePct: 85,
  },
  {
    key: 'appdirect_saas',
    label: 'AppDirect SaaS',
    short: 'ADS',
    supportedField: 'appdirect_saas_supported',
    netField: 'candid_net_appdirect_saas',
    // No separate partner row — use AppDirect rate, SaaS default if missing
    partnerNameMatchers: ['appdirect'],
    defaultSharePct: 80,
  },
];

/** Normalize sheet/DB percents that may be stored as 0.2 or 20. */
export function asPercentPoints(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(Number(v))) return null;
  const n = Number(v);
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

export function formatPctPoints(v: number | null | undefined, digits = 2): string {
  const n = asPercentPoints(v);
  if (n == null) return '—';
  const d = n % 1 === 0 ? 0 : digits;
  return `${n.toFixed(d)}%`;
}

/** Candid net % of MRC = gross × (candidSharePct / 100). */
export function computeCandidNetPct(
  grossPct: number | null | undefined,
  candidSharePct: number | null | undefined,
): number | null {
  const gross = asPercentPoints(grossPct);
  const share = asPercentPoints(candidSharePct);
  if (gross == null || share == null) return null;
  return Math.round(gross * (share / 100) * 10000) / 10000;
}

export function resolvePartnerSharePct(
  def: ProviderRatePartnerDef,
  partnerRates: Record<string, number | null>,
): number {
  for (const matcher of def.partnerNameMatchers) {
    const hit = partnerRates[matcher];
    if (hit != null && Number.isFinite(hit)) return hit;
  }
  // AppDirect SaaS: if only AppDirect row exists at 85, still prefer SaaS architecture default
  if (def.key === 'appdirect_saas') return def.defaultSharePct;
  return def.defaultSharePct;
}

/** Map deal pay-source label → Provider Rates partner key (null if not a residual partner). */
export function paySourceToPartnerKey(paySource: string | null | undefined): ProviderRatePartnerKey | null {
  const k = (paySource ?? '').trim().toLowerCase();
  if (!k) return null;
  if (k.includes('intelisys') || k.includes('intelysys')) return 'intelisys';
  if (k.includes('sandler')) return 'sandler';
  if (k.includes('telarus')) return 'telarus';
  if (k.includes('appdirect') && k.includes('saas')) return 'appdirect_saas';
  if (k.includes('appdirect')) return 'appdirect_telco';
  return null;
}

export function candidNetForPaySource(opts: {
  product: {
    gross_rate_pct: number | null;
    intelisys_supported?: boolean | null;
    sandler_supported?: boolean | null;
    telarus_supported?: boolean | null;
    appdirect_supported?: boolean | null;
    appdirect_saas_supported?: boolean | null;
    candid_net_intelisys?: number | null;
    candid_net_sandler?: number | null;
    candid_net_telarus?: number | null;
    candid_net_appdirect_telco?: number | null;
    candid_net_appdirect_saas?: number | null;
    net_overrides?: NetOverridesMap | null;
  };
  paySource: string | null | undefined;
  shareByKey: Record<ProviderRatePartnerKey, number>;
}): number | null {
  const overrides = parseNetOverrides(opts.product.net_overrides);
  const key = paySourceToPartnerKey(opts.paySource);

  const nets = PROVIDER_RATE_PARTNERS.map((def) => {
    const supported = Boolean(opts.product[def.supportedField]);
    if (!supported) return null;
    const eff = effectivePartnerNet({
      key: def.key,
      grossPct: opts.product.gross_rate_pct,
      sharePct: opts.shareByKey[def.key] ?? def.defaultSharePct,
      storedNet: opts.product[def.netField],
      overrides,
    });
    return { key: def.key, net: eff.net };
  }).filter((x): x is { key: ProviderRatePartnerKey; net: number } => x?.net != null);

  if (!nets.length) return null;
  if (key) {
    const hit = nets.find((n) => n.key === key);
    if (hit) return hit.net;
  }
  return Math.max(...nets.map((n) => n.net));
}

export type NetOverridesMap = Partial<Record<ProviderRatePartnerKey, number>>;

export function parseNetOverrides(raw: unknown): NetOverridesMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: NetOverridesMap = {};
  for (const def of PROVIDER_RATE_PARTNERS) {
    const v = (raw as Record<string, unknown>)[def.key];
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[def.key] = n;
  }
  return out;
}

/**
 * Effective net: explicit override wins; else compute from gross × partner share.
 * Legacy rows may have candid_net_* filled without net_overrides — treat as override
 * only when they differ from the computed default.
 */
export function effectivePartnerNet(opts: {
  key: ProviderRatePartnerKey;
  grossPct: number | null | undefined;
  sharePct: number;
  storedNet: number | null | undefined;
  overrides: NetOverridesMap;
}): { net: number | null; isOverride: boolean; computed: number | null } {
  const computed = computeCandidNetPct(opts.grossPct, opts.sharePct);
  if (opts.overrides[opts.key] != null) {
    return { net: asPercentPoints(opts.overrides[opts.key])!, isOverride: true, computed };
  }
  const stored = asPercentPoints(opts.storedNet);
  if (stored != null && computed != null && Math.abs(stored - computed) > 0.05) {
    return { net: stored, isOverride: true, computed };
  }
  if (stored != null && computed == null) {
    return { net: stored, isOverride: true, computed };
  }
  return { net: computed, isOverride: false, computed };
}
