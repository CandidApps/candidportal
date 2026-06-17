import type { ServiceCardModel } from '@/lib/services/account-services';

const RETURNING_KEY = (email: string) => `candid-returning-${email.toLowerCase().trim()}`;

/** Member has at least one active Candid-managed service (not pending-only). */
export function isFullPaidCustomer(services: ServiceCardModel[]): boolean {
  return services.some(
    (s) => s.badge === 'candid' && !s.pending && s.status !== 'external'
  );
}

export function isReturningMemberEmail(email: string): boolean {
  if (typeof window === 'undefined' || !email.trim()) return false;
  try {
    return localStorage.getItem(RETURNING_KEY(email)) === '1';
  } catch {
    return false;
  }
}

export function markReturningMemberEmail(email: string): void {
  if (typeof window === 'undefined' || !email.trim()) return;
  try {
    localStorage.setItem(RETURNING_KEY(email), '1');
  } catch {
    /* ignore */
  }
}

export function shouldGateAnalysis(
  services: ServiceCardModel[],
  analysisUnlockedFromDb = false,
  forceGate?: boolean
): boolean {
  if (forceGate) return true;
  if (analysisUnlockedFromDb) return false;
  return !isFullPaidCustomer(services);
}
