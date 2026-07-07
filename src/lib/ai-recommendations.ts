import type { CustomerAction } from '@/lib/portal-import/merge';
import type { CustomerPortalData } from '@/lib/portal-import/merge';

/** Phase-1 rules: renewal timing, sparse stack, sentiment-style urgency. */
export function scoreRecommendation(
  action: CustomerAction,
  portal?: CustomerPortalData | null,
): number {
  let score = 0;
  if (action.severity === 'urgent') score += 100;
  else if (action.severity === 'soon') score += 60;
  else score += 20;

  if (action.kind === 'renewal') score += 40;
  if (action.kind === 'optimization') score += 15;

  const serviceCount =
    (portal?.nonCandidServices?.length ?? 0) +
    (portal?.totalCandidMrc != null && portal.totalCandidMrc > 0 ? 1 : 0);
  if (serviceCount <= 2 && action.kind === 'optimization') score += 25;

  if (portal?.financialNotes && action.severity !== 'info') score += 8;

  const title = action.title.toLowerCase();
  if (title.includes('renew') || title.includes('expir')) score += 20;
  if (title.includes('reference folder') || title.includes('billing cycle note')) score -= 50;

  return score;
}

export function rankRecommendations(
  actions: CustomerAction[],
  portal?: CustomerPortalData | null,
): CustomerAction[] {
  return [...actions].sort(
    (a, b) => scoreRecommendation(b, portal) - scoreRecommendation(a, portal),
  );
}

export function pickHeroRecommendation(
  actions: CustomerAction[],
  portal?: CustomerPortalData | null,
): CustomerAction | null {
  const ranked = rankRecommendations(actions, portal);
  return ranked[0] ?? null;
}

export const AI_RECOMMENDATIONS_PHASE1_RULES = [
  'Prioritize contract renewals within 60–180 days and urgent severity items.',
  'Surface optimization opportunities when the account has a thin service stack (few tracked services).',
  'De-prioritize generic billing-cycle or reference-folder notes from legacy imports.',
  'Use portal talking points and financial notes as context for the hero recommendation.',
] as const;
