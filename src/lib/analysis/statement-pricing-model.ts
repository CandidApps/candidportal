import type { PricingModel, StatementData } from '@/lib/candid-pay/statementParser';
import type { PricingStructureId } from '@/lib/analysis/types';

const EXPLICIT_MODELS: PricingModel[] = [
  'interchange_plus',
  'flat_rate',
  'tiered',
  'dual_pricing',
  'cash_discount',
];

function normalizePricingModel(raw?: string | null): PricingModel | null {
  const model = (raw ?? '').trim() as PricingModel;
  return EXPLICIT_MODELS.includes(model) ? model : null;
}

/** True when statement shows interchange pass-through separate from processor markup. */
export function hasInterchangePassThrough(stmt?: StatementData | null): boolean {
  if (!stmt) return false;
  return (stmt.feeBreakdown?.interchange ?? 0) > 0;
}

/**
 * Infer pricing model from fee layout when the parser did not set pricingModel.
 * Flat-rate statements often put all discount fees in processingMarkup — that is NOT IC+ markup.
 */
export function inferPricingModelFromStatement(stmt?: StatementData | null): PricingModel | null {
  if (!stmt) return null;

  const explicit = normalizePricingModel(stmt.pricingModel);
  if (explicit) return explicit;

  if (hasInterchangePassThrough(stmt)) return 'interchange_plus';

  const markup = stmt.feeBreakdown?.processingMarkup ?? 0;
  const markupBps = stmt.processingMarkupBps ?? 0;
  // Only treat markup as IC+ when interchange is also visible on the statement.
  if (markup > 0 && hasInterchangePassThrough(stmt)) return 'interchange_plus';
  if (markupBps > 0 && hasInterchangePassThrough(stmt)) return 'interchange_plus';

  if (markup > 0 || stmt.effectiveRate > 0) return 'flat_rate';

  return null;
}

export function detectedPricingStructure(
  pricingModel?: string | null,
  statement?: StatementData | null,
): PricingStructureId {
  const fromForm = normalizePricingModel(pricingModel);
  const fromStatement = normalizePricingModel(statement?.pricingModel);

  // Explicit model from admin form or parsed statement wins over fee heuristics.
  const explicit = fromForm ?? fromStatement;
  if (explicit === 'interchange_plus') return 'interchange_plus';
  if (explicit === 'flat_rate' || explicit === 'tiered') return 'flat_rate';
  if (explicit === 'dual_pricing' || explicit === 'cash_discount') return 'dual_pricing';

  const inferred = inferPricingModelFromStatement(statement);
  if (inferred === 'interchange_plus') return 'interchange_plus';
  if (inferred === 'flat_rate' || inferred === 'tiered') return 'flat_rate';
  if (inferred === 'dual_pricing' || inferred === 'cash_discount') return 'dual_pricing';

  return 'interchange_plus';
}

export function isInterchangePlusStructure(
  pricingModel?: string | null,
  statement?: StatementData | null,
): boolean {
  return detectedPricingStructure(pricingModel, statement) === 'interchange_plus';
}
