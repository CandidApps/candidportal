import {
  buildPortalCandidServices,
  buildPortalNonCandidServices,
  buildPortalPreviousServices,
} from '@/lib/member-portal-services';
import {
  buildMemberServicesSnapshot,
  formatSnapshotMoney,
  type MemberServicesSnapshot,
} from '@/lib/services/member-services-snapshot';
import type { ServiceCardModel } from '@/lib/services/account-services';

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
    ...buildPortalPreviousServices(customerId),
  ];
}

export function buildCustomerRelationshipSavings(
  customerId: string,
  accountSavings?: number | null,
): CustomerRelationshipSavings {
  const services = buildCustomerAccountServices(customerId);
  const activeServices = services.filter((s) => !s.previousService && s.status !== 'inactive');
  const previousServices = services.filter((s) => s.previousService);

  const snapshot = buildMemberServicesSnapshot(services, { accountSavings });

  const pastServicesMonthlySavings = previousServices.reduce(
    (sum, s) => sum + (s.monthlySavingsWhileActive ?? 0),
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
