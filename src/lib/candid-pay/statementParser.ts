export type PricingModel =
  | 'interchange_plus'
  | 'tiered'
  | 'flat_rate'
  | 'dual_pricing'
  | 'cash_discount';

export type StatementData = {
  merchantName: string;
  statementDate: string;
  totalVolume: number;
  totalFees: number;
  transactionCount: number;
  avgTicket: number;
  cardBreakdown: { visa: number; mastercard: number; discover: number; amex: number };
  feeBreakdown: {
    interchange: number;
    processingMarkup: number;
    networkFees: number;
    nonQualSurcharge: number;
    authFees: number;
    bascStand: number;
    stmtMail: number;
    acctFee: number;
    otherFixed: number;
  };
  pricingModel: PricingModel;
  pricingModelEvidence: string;
  processingMarkupBps: number;
  effectiveRate: number;
};

/**
 * CandidPay Statement Parser
 * ==========================
 * Sends merchant PDF statements to Claude via the Next.js API route
 * (/api/parse-statement) for AI-powered data extraction.
 *
 * The API route handles the actual Anthropic SDK call server-side
 * so the API key is never exposed to the browser.
 */

// ── Pricing model detection prompt shared with the API route
export const EXTRACTION_PROMPT = `You are a payment processing expert. Analyze this merchant billing statement and extract the following data. Return ONLY a valid JSON object — no markdown, no backticks, no extra text.

Required JSON format:
{
  "merchantName": "exact business name from statement",
  "statementDate": "MM/YYYY",
  "totalVolume": 0.00,
  "totalFees": 0.00,
  "transactionCount": 0,
  "avgTicket": 0.00,
  "cardBreakdown": {
    "visa": 0.00,
    "mastercard": 0.00,
    "discover": 0.00,
    "amex": 0.00
  },
  "feeBreakdown": {
    "interchange": 0.00,
    "processingMarkup": 0.00,
    "networkFees": 0.00,
    "nonQualSurcharge": 0.00,
    "authFees": 0.00,
    "bascStand": 0.00,
    "stmtMail": 0.00,
    "acctFee": 0.00,
    "otherFixed": 0.00
  },
  "pricingModel": "interchange_plus | tiered | flat_rate | dual_pricing | cash_discount",
  "pricingModelEvidence": "one sentence explaining why this pricing model was detected",
  "processingMarkupBps": 0,
  "effectiveRate": 0.00
}

Pricing model detection rules:
- interchange_plus: Statement shows interchange broken out separately PLUS processing fees/markup on top. Look for "Interchange - Visa", "Total Interchange", then separate "Processing Fees". Most common model.
- tiered: Shows qualified / mid-qualified / non-qualified tiers with different rates per tier.
- flat_rate: Single flat discount rate applied uniformly to all volume — no interchange breakdown visible.
- dual_pricing: Shows surcharge, convenience fee, or dual pricing line items passed to cardholder.
- cash_discount: Shows cash discount adjustment credits reducing the merchant's effective cost.

Fee extraction notes:
- BASC STAND = base/standard monthly plan fee → extract as bascStand
- STMT MAIL = paper statement fee → extract as stmtMail
- OTHR NQ VOL FEE = non-qualified volume surcharge → extract as nonQualSurcharge
- ACCT. FEE = monthly account maintenance fee → extract as acctFee
- Chargebacks, retrieval fees, PCI non-compliance penalties, and other one-time or variable fees → extract as otherFixed (NOT recurring monthly costs)

For processingMarkupBps: ONLY for interchange_plus statements — processor markup above interchange, (processingMarkup / totalVolume * 10000) rounded. Set to 0 for flat_rate, tiered, dual_pricing, and cash_discount (those models may show discount fees in processingMarkup but that is NOT IC+ markup).
For effectiveRate: (totalFees / totalVolume * 100) rounded to 2 decimal places.`;

/**
 * Convert a File object to a base64 string.
 * @param {File} file
 * @returns {Promise<string>} base64 data without the data URL prefix
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Parse a merchant statement PDF using Claude AI.
 * Calls the Next.js API route /api/parse-statement which handles
 * the Anthropic SDK call server-side.
 *
 * @param {string} base64Data - Base64-encoded PDF content
 * @returns {Promise<StatementData|null>} Parsed statement data or null on failure
 *
 * @typedef {Object} StatementData
 * @property {string} merchantName
 * @property {string} statementDate       - "MM/YYYY"
 * @property {number} totalVolume
 * @property {number} totalFees
 * @property {number} transactionCount
 * @property {number} avgTicket
 * @property {{ visa: number, mastercard: number, discover: number, amex: number }} cardBreakdown
 * @property {{ interchange: number, processingMarkup: number, networkFees: number,
 *              nonQualSurcharge: number, authFees: number, bascStand: number,
 *              stmtMail: number, acctFee: number, otherFixed: number }} feeBreakdown
 * @property {'interchange_plus'|'tiered'|'flat_rate'|'dual_pricing'|'cash_discount'} pricingModel
 * @property {string} pricingModelEvidence
 * @property {number} processingMarkupBps
 * @property {number} effectiveRate
 */
export async function parseStatementWithClaude(base64Data: string): Promise<StatementData> {
  try {
    const response = await fetch('/api/parse-statement', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pdf: base64Data }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('Parse API error:', response.status, body);
      throw new Error(
        response.status === 503
          ? 'Statement parsing is not configured on the server.'
          : 'Statement parsing failed. Please check the PDF and try again.'
      );
    }

    const data = (await response.json()) as { result?: StatementData; error?: string };
    if (data.error) {
      throw new Error(data.error);
    }
    if (!data.result) {
      throw new Error('Statement parsing returned no data.');
    }
    return data.result;

  } catch (err) {
    console.error('Statement parse failed:', err);
    throw err instanceof Error ? err : new Error('Statement parse failed');
  }
}

/**
 * Average a numeric field across an array of parsed statements.
 * @param {StatementData[]} statements
 * @param {string} key - Top-level key on the statement object
 * @returns {number}
 */
export function avgField(statements: StatementData[], key: keyof StatementData) {
  if (!statements.length) return 0;
  return statements.reduce((sum, s) => sum + (parseFloat(String(s[key])) || 0), 0) / statements.length;
}

/**
 * Average a nested fee field across statements.
 * @param {StatementData[]} statements
 * @param {string} feeKey - Key within feeBreakdown
 * @returns {number}
 */
export function avgFeeField(
  statements: StatementData[],
  feeKey: keyof StatementData['feeBreakdown']
) {
  if (!statements.length) return 0;
  return statements.reduce((sum, s) => sum + (s.feeBreakdown?.[feeKey] || 0), 0) / statements.length;
}

/**
 * Sort statements chronologically (oldest first).
 * @param {StatementData[]} statements
 * @returns {StatementData[]}
 */
export function sortStatements(statements: StatementData[]) {
  return [...statements].sort((a, b) => {
    const [aM, aY] = (a.statementDate || '01/2000').split('/');
    const [bM, bY] = (b.statementDate || '01/2000').split('/');
    return new Date(`${aY}-${aM}-01`).getTime() - new Date(`${bY}-${bM}-01`).getTime();
  });
}
