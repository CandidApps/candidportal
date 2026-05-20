// @ts-nocheck — business logic from CandidPayEngine; see docs/CURSOR_SPEC.md
/**
 * CandidPay Pricing Engine
 * ========================
 * All business logic for statement analysis, pricing rule application,
 * and internal profitability calculation.
 *
 * INTERNAL USE ONLY — Schedule A data must never be exposed to merchants.
 */

// ================================================================
// SCHEDULE A — BUY RATES
// Source: PayCosmos (Card Processing) + Linked2Pay (ACH/Gateway)
// IMPORTANT: Never reference processor names in any customer-facing output.
// ================================================================
export const SCHEDULE_A = {
  cc: {
    interchangeMarkupBps:    2,       // Interchange + 2 bps buy rate
    transactionFee:          0.0215,  // Per item
    authFee:                 0.03,    // Per item
    avsFee:                  0.01,    // Per item
    batchFee:                0.03,    // Per batch
    chargebackFee:           20.00,   // Per occurrence (Revenue Share: Yes)
    retrievalFee:            2.50,    // Per occurrence (Revenue Share: Yes)
    // Monthly — Revenue Share: Yes
    accountMaintenanceMonthly: 2.99,
    onlineReportingMonthly:    2.95,
    pciComplianceMonthly:      2.53,
    annualFeeMonthly:          20.00 / 12,
    reporting1099kMonthly:     15.00 / 12,
    // Additional costs — Revenue Share: NO (CandidPay absorbs)
    accountOnFileOpen:     0.99,
    accountOnFileClosed:   0.49,
    merchantStatement:     0.25,
    electronicStatement:   0.45,
    irsRegReporting:       0.95,
    excessiveChargeback:   4.00,   // Per occurrence above threshold
  },
  ach: {
    gatewayMonthly:        3.00,
    achEnabledMonthly:     5.00,
    transactionFee:        0.10,
    returnFee:             0.25,
    unauthorizedReturnFee: 7.50,
    nextDayFundingBps:     10,
    accountVerification:   0.30,   // NACHA mandated, Revenue Share: No
    noticeOfChange:        0.50,   // Revenue Share: No
    earlyTermination:      65.00,  // Revenue Share: No
    revenueShare:          0.85,
    // Standard limits — flag if merchant exceeds these
    standardItemLimit:     1000,
    standardDailyLimit:    5000,
    hardLimit:             15000,
  },
  // Risk tier costs — directly impact CandidPay profitability
  risk: {
    low:  { binMonitoringBps: 0,  monthlyFee: 0,  revenueShare: 0.99 },
    mid:  { binMonitoringBps: 5,  monthlyFee: 0,  revenueShare: 0.85 },
    high: { binMonitoringBps: 35, monthlyFee: 10, revenueShare: 0.65 },
  },
};

// ================================================================
// MCC RISK CLASSIFICATION TABLE
// Source: Visa VIRP, Mastercard SMRP, industry standards
// ================================================================
export const MCC_RISK_TABLE = {
  // ── LOW RISK — 99% Revenue Share ────────────────────────────────
  5411: { risk: 'low', label: 'Grocery Stores / Supermarkets' },
  5412: { risk: 'low', label: 'Convenience Stores' },
  5422: { risk: 'low', label: 'Meat Lockers / Freezer Provisioners' },
  5441: { risk: 'low', label: 'Candy / Nut / Confection Stores' },
  5451: { risk: 'low', label: 'Dairy Product Stores' },
  5462: { risk: 'low', label: 'Bakeries' },
  5499: { risk: 'low', label: 'Miscellaneous Food Stores' },
  5511: { risk: 'low', label: 'Car Dealers (New & Used)' },
  5521: { risk: 'low', label: 'Used Car Dealers' },
  5531: { risk: 'low', label: 'Auto Parts Stores' },
  5541: { risk: 'low', label: 'Service Stations / Gas' },
  5551: { risk: 'low', label: 'Boat Dealers' },
  5561: { risk: 'low', label: 'Camper / RV Dealers' },
  5571: { risk: 'low', label: 'Motorcycle Shops' },
  5200: { risk: 'low', label: 'Home Supply / Lumber' },
  5251: { risk: 'low', label: 'Hardware Stores' },
  5261: { risk: 'low', label: 'Lawn & Garden Supply' },
  5310: { risk: 'low', label: 'Discount Stores' },
  5311: { risk: 'low', label: 'Department Stores' },
  5331: { risk: 'low', label: 'Variety Stores' },
  5712: { risk: 'low', label: 'Furniture Stores' },
  5713: { risk: 'low', label: 'Floor Covering Stores' },
  5731: { risk: 'low', label: 'Electronics / Radio Stores' },
  5734: { risk: 'low', label: 'Computer / Software Stores' },
  5812: { risk: 'low', label: 'Restaurants / Eating Places' },
  5813: { risk: 'low', label: 'Bars / Taverns (On-Premises)' },
  5814: { risk: 'low', label: 'Fast Food Restaurants' },
  5912: { risk: 'low', label: 'Drug Stores / Pharmacies (Brick & Mortar)' },
  5940: { risk: 'low', label: 'Bicycle Shops' },
  5941: { risk: 'low', label: 'Sporting Goods Stores' },
  5942: { risk: 'low', label: 'Book Stores' },
  5943: { risk: 'low', label: 'Office / Stationery Stores' },
  5945: { risk: 'low', label: 'Hobby / Toy / Game Shops' },
  5947: { risk: 'low', label: 'Gift / Card / Novelty Stores' },
  5977: { risk: 'low', label: 'Cosmetics / Beauty Supply' },
  5999: { risk: 'low', label: 'Miscellaneous Retail (Low-Risk)' },
  5621: { risk: 'low', label: "Women's Ready-to-Wear" },
  5631: { risk: 'low', label: "Women's Accessories" },
  5641: { risk: 'low', label: "Children's Clothing" },
  5651: { risk: 'low', label: 'Family Clothing Stores' },
  5661: { risk: 'low', label: 'Shoe Stores' },
  5691: { risk: 'low', label: "Men's / Women's Clothing" },
  7011: { risk: 'low', label: 'Hotels / Motels (Walk-in)' },
  7041: { risk: 'low', label: 'Civic / Social Associations' },
  7210: { risk: 'low', label: 'Laundry / Cleaning Services' },
  7230: { risk: 'low', label: 'Beauty / Barber Shops' },
  7261: { risk: 'low', label: 'Funeral Services' },
  7298: { risk: 'low', label: 'Health / Spa Services' },
  7349: { risk: 'low', label: 'Building Cleaning / Maintenance' },
  7372: { risk: 'low', label: 'Computer Programming / IT' },
  7392: { risk: 'low', label: 'Consulting / Management Services' },
  7394: { risk: 'low', label: 'Equipment Rental / Leasing' },
  7399: { risk: 'low', label: 'Miscellaneous Business Services' },
  7512: { risk: 'low', label: 'Car Rental' },
  7523: { risk: 'low', label: 'Parking Lots / Garages' },
  7538: { risk: 'low', label: 'Automotive Service Shops' },
  7542: { risk: 'low', label: 'Car Washes' },
  7549: { risk: 'low', label: 'Towing Services' },
  7832: { risk: 'low', label: 'Movie Theaters' },
  8011: { risk: 'low', label: 'Doctors / Physicians' },
  8021: { risk: 'low', label: 'Dentists / Orthodontists' },
  8031: { risk: 'low', label: 'Osteopaths' },
  8049: { risk: 'low', label: 'Chiropractors / Podiatrists' },
  8099: { risk: 'low', label: 'Health Services (Misc)' },
  8111: { risk: 'low', label: 'Legal Services / Attorneys' },
  8211: { risk: 'low', label: 'Elementary / Secondary Schools' },
  8220: { risk: 'low', label: 'Colleges / Universities' },
  8351: { risk: 'low', label: 'Child Care Services' },
  8641: { risk: 'low', label: 'Civic / Social Clubs' },
  8742: { risk: 'low', label: 'Management / Consulting' },
  742:  { risk: 'low', label: 'Veterinary Services' },
  780:  { risk: 'low', label: 'Landscaping / Horticultural Services' },
  4214: { risk: 'low', label: 'Motor Freight / Trucking' },
  4215: { risk: 'low', label: 'Courier Services' },

  // ── MID RISK — 85% Revenue Share + 5 bps BIN Monitoring ──────────
  4722: { risk: 'mid', label: 'Travel Agencies' },
  4814: { risk: 'mid', label: 'Telephone Services' },
  4816: { risk: 'mid', label: 'Computer Network Services' },
  5047: { risk: 'mid', label: 'Medical / Dental Supplies' },
  5065: { risk: 'mid', label: 'Electrical Parts / Equipment (High Value)' },
  5094: { risk: 'mid', label: 'Jewelry / Watches / Precious Stones' },
  5735: { risk: 'mid', label: 'Music Stores' },
  5816: { risk: 'mid', label: 'Digital Goods — Games' },
  5817: { risk: 'mid', label: 'Digital Goods — Applications' },
  5818: { risk: 'mid', label: 'Digital Goods — Large Merchants' },
  5921: { risk: 'mid', label: 'Package Stores / Liquor Stores' },
  5944: { risk: 'mid', label: 'Jewelry Stores' },
  6011: { risk: 'mid', label: 'ATMs / Cash Dispensing' },
  6211: { risk: 'mid', label: 'Securities Brokers / Dealers' },
  7514: { risk: 'mid', label: 'Passenger Car Rentals (Online)' },
  7922: { risk: 'mid', label: 'Theatrical Producers / Ticket Agencies' },
  7929: { risk: 'mid', label: 'Bands / Orchestras / Entertainers' },
  7941: { risk: 'mid', label: 'Professional Sports Clubs' },
  7997: { risk: 'mid', label: 'Country Clubs / Memberships' },
  8299: { risk: 'mid', label: 'Online Educational Services' },

  // ── HIGH RISK — 65% Revenue Share + 35 bps + $10/mo ─────────────
  5122: { risk: 'high', label: 'Drugs / Drug Proprietaries (Online)' },
  5962: { risk: 'high', label: 'Direct Marketing — Travel' },
  5966: { risk: 'high', label: 'Direct Marketing — Outbound Telemarketing' },
  5967: { risk: 'high', label: 'Direct Marketing — Inbound Telemarketing' },
  5971: { risk: 'high', label: 'Art Dealers / Galleries' },
  5993: { risk: 'high', label: 'Cigar / Tobacco / Smokeless Stores' },
  6012: { risk: 'high', label: 'Financial Institutions — Merch/Services' },
  6051: { risk: 'high', label: 'Non-Financial Inst. / Crypto / FX Exchange' },
  6099: { risk: 'high', label: 'Financial Services (NEC)' },
  7273: { risk: 'high', label: 'Dating / Escort Services' },
  7801: { risk: 'high', label: 'Casinos (Government Licensed)' },
  7802: { risk: 'high', label: 'Horse / Dog Racing (Licensed)' },
  7994: { risk: 'high', label: 'Video Game Arcades (Gambling-Adjacent)' },
  7995: { risk: 'high', label: 'Gambling / Lottery / Betting' },
  7996: { risk: 'high', label: 'Amusement Parks' },
  4899: { risk: 'high', label: 'Cable / Satellite / Pay TV' },
  9211: { risk: 'high', label: 'Court Costs / Fines' },
  9311: { risk: 'high', label: 'Tax Payments' },
  9399: { risk: 'high', label: 'Government Services (NEC)' },
};

// ================================================================
// PRICING MODEL METADATA
// ================================================================
export const PRICING_MODELS = {
  interchange_plus: {
    label: 'Interchange Plus',
    color: '#1a9e8c',
    description: 'Interchange cost passed through + fixed markup (bps) on top.',
    evidence: 'Statement shows interchange broken out separately with processing markup on top.',
  },
  tiered: {
    label: 'Tiered (Qual / Mid-Qual / Non-Qual)',
    color: '#f97316',
    description: 'Three rate tiers based on card qualification.',
    evidence: 'Statement shows multiple qualification tiers with different rates per tier.',
  },
  flat_rate: {
    label: 'Flat Rate',
    color: '#6d28d9',
    description: 'Single uniform rate applied to all volume regardless of card type.',
    evidence: 'Single flat discount rate applied uniformly — no interchange breakdown.',
  },
  dual_pricing: {
    label: 'Dual Pricing / Surcharge',
    color: '#0369a1',
    description: 'Surcharge or convenience fee passed to cardholder.',
    evidence: 'Statement shows surcharge or convenience fee passed to cardholder.',
  },
  cash_discount: {
    label: 'Cash Discount',
    color: '#64748b',
    description: 'Higher price for card users; discount given to cash payers.',
    evidence: 'Statement shows cash discount adjustment credits reducing merchant cost.',
  },
};

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

/** Format a number as a dollar string */
export const fmt$ = (n: number) =>
  n < 0
    ? `-$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Format a number as a percentage string */
export const fmtPct = (n: number | string, decimals = 2) => `${parseFloat(String(n || 0)).toFixed(decimals)}%`;

// ================================================================
// CLASSIFICATION
// ================================================================

/**
 * Classify a merchant's risk level from their MCC code.
 * Defaults to mid-risk if MCC is unknown.
 * @param {number|string} mcc
 * @returns {{ risk: 'low'|'mid'|'high', label: string }}
 */
export function classifyMCC(mcc: number | string) {
  if (!mcc) return { risk: 'low', label: 'Not Specified' };
  return MCC_RISK_TABLE[parseInt(mcc)] || { risk: 'mid', label: 'Unclassified Industry (Defaulted to Mid)' };
}

// ================================================================
// PRICING ENGINES
// ================================================================

/**
 * Interchange Plus savings calculator.
 *
 * "fees + processing fees" = all non-interchange charges on statement
 * expressed as basis points on total CC volume.
 *
 * Rule:
 *   < 30 bps markup  → save 10 bps
 *   31–60 bps markup → save 20 bps
 *   > 60 bps markup  → save 30 bps
 *
 * @param {{ currentMarkupBps: number, ccVolume: number }} params
 */
export function calcInterchangePlusSavings({ currentMarkupBps, ccVolume }) {
  const bps = parseFloat(currentMarkupBps) || 0;
  const vol = parseFloat(ccVolume) || 0;
  const savingBps = bps < 30 ? 10 : bps <= 60 ? 20 : 30;
  const newBps = Math.max(bps - savingBps, 5); // minimum 5 bps floor

  return {
    savingBps,
    newMarkupBps:   newBps,
    newRate:        `Interchange + ${newBps} bps`,
    currentCost:    vol * (bps / 10000),
    newCost:        vol * (newBps / 10000),
    monthlySavings: vol * ((bps - newBps) / 10000),
    annualSavings:  vol * ((bps - newBps) / 10000) * 12,
  };
}

/**
 * Flat Rate savings calculator.
 *
 * Floors: 2.5% in-person | 2.8% online
 * Max improvement: 30 bps from current rate
 *
 * @param {{ currentEffectiveRate: number, ccVolume: number, cardPresentPct: number }} params
 */
export function calcFlatRateSavings({ currentEffectiveRate, ccVolume, cardPresentPct }) {
  const rate   = parseFloat(currentEffectiveRate) / 100 || 0;
  const vol    = parseFloat(ccVolume) || 0;
  const cpPct  = parseFloat(cardPresentPct) / 100 || 0.5;
  const FLOOR_CP = 0.025; // 2.5% — in-person floor
  const FLOOR_CN = 0.028; // 2.8% — online floor
  const MAX_SAVE = 0.003; // 30 bps max improvement
  const newCP  = Math.max(rate - MAX_SAVE, FLOOR_CP);
  const newCN  = Math.max(rate - MAX_SAVE, FLOOR_CN);
  const blended = cpPct * newCP + (1 - cpPct) * newCN;

  return {
    newInPersonRate:  +(newCP * 100).toFixed(2),
    newOnlineRate:    +(newCN * 100).toFixed(2),
    blendedNewRate:   +(blended * 100).toFixed(2),
    currentCost:      vol * rate,
    newCost:          vol * blended,
    monthlySavings:   vol * (rate - blended),
    annualSavings:    vol * (rate - blended) * 12,
  };
}

/**
 * CandidPay Flat 3% option calculator.
 * Always offered alongside dual pricing for comparison.
 *
 * @param {{ currentEffectiveRate: number, ccVolume: number }} params
 */
export function calcFlat3Savings({ currentEffectiveRate, ccVolume }) {
  const rate = parseFloat(currentEffectiveRate) / 100 || 0;
  const vol  = parseFloat(ccVolume) || 0;
  const FLAT = 0.03;

  return {
    flatRate:       3.0,
    currentCost:    vol * rate,
    newCost:        vol * FLAT,
    monthlySavings: vol * (rate - FLAT),
    annualSavings:  vol * (rate - FLAT) * 12,
  };
}

/**
 * Dual Pricing savings calculator.
 *
 * CC cost is passed to cardholder → merchant pays near $0 on CC.
 * ACH floor: 0.25%.
 *
 * Competitive cascade:
 *   New merchant          → 3.5% CC / 1.0% ACH
 *   Currently at 3.5%    → 3.25% CC / 0.75% ACH
 *   Currently at 3.25%   → 3.0% CC / 0.50% ACH
 *   Currently at 3.0%+   → 3.0% CC / 0.25% ACH (match/best)
 *
 * @param {{ currentCCRate: number, currentACHRate: number, ccVolume: number, achVolume: number }} params
 */
export function calcDualPricingSavings({ currentCCRate, currentACHRate, ccVolume, achVolume }) {
  const ccRate  = parseFloat(currentCCRate)  / 100 || 0;
  const achRate = parseFloat(currentACHRate) / 100 || 0.01;
  const ccVol   = parseFloat(ccVolume)  || 0;
  const achVol  = parseFloat(achVolume) || 0;
  const ccPct   = ccRate * 100;

  let newCCRate, newACHRate, offerLabel;
  if (ccPct === 0)       { newCCRate = 3.5;  newACHRate = 1.00; offerLabel = 'Standard (New to Dual Pricing)'; }
  else if (ccPct >= 3.5) { newCCRate = 3.25; newACHRate = 0.75; offerLabel = 'Step Down from 3.5%'; }
  else if (ccPct >= 3.25){ newCCRate = 3.0;  newACHRate = 0.50; offerLabel = 'Step Down from 3.25%'; }
  else                   { newCCRate = 3.0;  newACHRate = 0.25; offerLabel = 'Match / Best Available'; }

  const achRateFinal    = Math.max(newACHRate, 0.25); // floor 0.25%
  const currentCCCost   = ccVol  * ccRate;
  const currentACHCost  = achVol * achRate;
  const newMerchantCC   = 0; // passed to cardholder
  const newACHCost      = achVol * (achRateFinal / 100);

  return {
    newCCRate,
    newACHRate:            achRateFinal,
    offerLabel,
    ccPassedToCardholder:  true,
    currentCost:           currentCCCost + currentACHCost,
    newCost:               newMerchantCC + newACHCost,
    monthlySavings:        (currentCCCost + currentACHCost) - (newMerchantCC + newACHCost),
    annualSavings:         ((currentCCCost + currentACHCost) - (newMerchantCC + newACHCost)) * 12,
  };
}

// ================================================================
// INTERNAL PROFITABILITY — CANDIDPAY MANAGEMENT ONLY
// DO NOT include in any customer-facing output or API response.
// ================================================================

/**
 * Calculate CandidPay's net monthly profitability on an account.
 *
 * @param {{
 *   ccVolume: number,
 *   achVolume: number,
 *   transactionCount: number,
 *   agentTier: 'standard'|'full'|'elite',
 *   riskLevel: 'low'|'mid'|'high',
 *   proposedRatePct: number   // e.g. 3.0 for 3%
 * }} params
 */
export function calcProfitability({ ccVolume, achVolume, transactionCount, agentTier, riskLevel, proposedRatePct }) {
  const vol      = parseFloat(ccVolume) || 0;
  const achVol   = parseFloat(achVolume) || 0;
  const txnCount = parseFloat(transactionCount) || Math.round(vol / 75);
  const rate     = parseFloat(proposedRatePct) / 100 || 0.03;
  const risk     = SCHEDULE_A.risk[riskLevel] || SCHEDULE_A.risk.low;

  // Gross revenue (what merchant pays CandidPay)
  const grossRevenue = vol * rate;

  // CandidPay's Schedule A buy costs
  const interchangeCost = vol * (SCHEDULE_A.cc.interchangeMarkupBps / 10000);
  const perTxnCost      = txnCount * (SCHEDULE_A.cc.transactionFee + SCHEDULE_A.cc.authFee + SCHEDULE_A.cc.avsFee);
  const fixedMonthly    = SCHEDULE_A.cc.accountMaintenanceMonthly
                        + SCHEDULE_A.cc.onlineReportingMonthly
                        + SCHEDULE_A.cc.pciComplianceMonthly
                        + SCHEDULE_A.cc.annualFeeMonthly
                        + SCHEDULE_A.cc.reporting1099kMonthly;
  const binCost         = vol * (risk.binMonitoringBps / 10000);
  const totalBuyCost    = interchangeCost + perTxnCost + fixedMonthly + binCost + risk.monthlyFee;

  // CandidPay revenue share
  const candidShare  = grossRevenue * risk.revenueShare;
  const ccMargin     = candidShare - totalBuyCost;

  // ACH margin estimate
  const achGross  = achVol * 0.01;
  const achCost   = SCHEDULE_A.ach.gatewayMonthly
                  + SCHEDULE_A.ach.achEnabledMonthly
                  + Math.round(achVol / 500) * SCHEDULE_A.ach.transactionFee;
  const achMargin = (achGross - achCost) * SCHEDULE_A.ach.revenueShare;

  const totalMargin = ccMargin + Math.max(achMargin, 0);

  // Agent payout
  const agentPct    = agentTier === 'elite' ? 0.65 : agentTier === 'full' ? 0.50 : 0.25;
  const agentPayout = totalMargin * agentPct;
  const netProfit   = totalMargin - agentPayout;

  return {
    grossRevenue,
    interchangeCost,
    perTxnCost,
    fixedMonthly,
    binCost,
    riskMonthlyFee:   risk.monthlyFee,
    totalBuyCost,
    candidShare,
    totalMargin,
    riskLevel,
    binMonitoringBps: risk.binMonitoringBps,
    revenueSharePct:  risk.revenueShare * 100,
    agentTier,
    agentPct:         agentPct * 100,
    agentPayout,
    netProfit,
    annualNetProfit:  netProfit * 12,
    marginPct:        vol > 0 ? (netProfit / grossRevenue) * 100 : 0,
  };
}
