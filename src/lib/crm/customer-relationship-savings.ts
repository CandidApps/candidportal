import {
  buildPortalCandidServices,
  buildPortalNonCandidServices,
} from '@/lib/member-portal-services';
import {
  buildMemberServicesSnapshot,
  formatSnapshotMoney,
  type MemberServicesSnapshot,
} from '@/lib/services/member-services-snapshot';
import type { ServiceCardModel } from '@/lib/services/account-services';
import { computeServiceSavingsDisplay } from '@/lib/services/service-savings';
import { quoteSavingsPreview } from '@/lib/services/quote-savings';

export type CustomerRelationshipSavings = MemberServicesSnapshot & {
  lifetimeMonthlySavings: number;
  activeMonthlySavings: number;
  pastServicesMonthlySavings: number;
  servicesTouchedCount: number;
};

export function buildCustomerAccountServices(customerId: string): ServiceCardModel[] {
  return [
    ...buildPortalCandidServices(customerId),
    ...buildPortalNonCandidServices(customerId),
  ];
}

function monthlySavingsForService(service: ServiceCardModel): number {
  const display = computeServiceSavingsDisplay({
    snapshot: service.analysisSnapshot ?? null,
    baseline: service.savingsBaseline ?? null,
    addedSeatCount: service.addedSeatCount ?? 0,
  });
  return (
    display?.adjusted?.monthly ??
    display?.original.monthly ??
    quoteSavingsPreview(service)?.monthly ??
    0
  );
}

export function buildCustomerRelationshipSavings(
  customerId: string,
  accountSavings?: number | null,
): CustomerRelationshipSavings {
  const services = buildCustomerAccountServices(customerId);
  const previousServices = services.filter((s) => s.status === 'expired');

  const snapshot = buildMemberServicesSnapshot(services, { accountSavings });

  const pastServicesMonthlySavings = previousServices.reduce(
    (sum, s) => sum + monthlySavingsForService(s),
    0,
  );
  const activeMonthlySavings = snapshot.monthlySavings;
  const lifetimeMonthlySavings = activeMonthlySavings + pastServicesMonthlySavings;

  const servicesTouchedCount = new Set(
    services
      .filter((s) => !s.trackingOnly)
      .map((s) => s.contractId ?? s.id),
  ).size;

  return {
    ...snapshot,
    lifetimeMonthlySavings,
    activeMonthlySavings,
    pastServicesMonthlySavings,
    servicesTouchedCount,
  };
}

export { formatSnapshotMoney };
