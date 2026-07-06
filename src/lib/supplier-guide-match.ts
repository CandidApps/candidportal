import type { SupplierGuide } from '@/lib/supplier-guides-types';

const PAYMENT_GUIDE_PATTERN =
  /payment|billing|credit\s*card|card\s*on\s*file|update\s*card|invoice|pay\s*method|autopay/i;

/** Best portal guide for payment / billing self-service for a vendor. */
export function findPaymentSelfServiceGuide(guides: SupplierGuide[]): SupplierGuide | null {
  const matches = guides.filter(
    (g) => PAYMENT_GUIDE_PATTERN.test(g.title) || PAYMENT_GUIDE_PATTERN.test(g.content),
  );
  if (!matches.length) return null;
  return matches.sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
}
