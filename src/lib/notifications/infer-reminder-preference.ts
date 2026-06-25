import type { MemberEmailNotificationKey } from '@/lib/portal/notification-preferences';

/** Best-effort mapping from reminder copy to a member email preference key. */
export function preferenceKeyForCustomerReminder(
  title: string,
  body?: string | null,
): MemberEmailNotificationKey {
  const hay = `${title} ${body ?? ''}`.toLowerCase();

  if (/rate\s*increase|fee\s*increase|pricing\s*change|rate\s*change/.test(hay)) {
    return 'rate_increases';
  }
  if (/renewal|renew\b|auto-?renew/.test(hay)) {
    return 'contract_renewals';
  }
  if (/expir|expiring|expiration|end of term/.test(hay)) {
    return 'services_expiring';
  }
  if (/new\s*service|service\s*added|added to your account/.test(hay)) {
    return 'service_added';
  }
  if (/savings\s*opportunit/.test(hay)) {
    return 'savings_opportunities';
  }
  if (/statement|invoice|bill\s*review/.test(hay)) {
    return 'statement_reviewed';
  }

  return 'contract_renewals';
}
