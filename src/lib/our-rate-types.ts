import type { ScheduleARateLine } from '@/lib/schedule-a-types';

export type OurRateRecord = {
  providerId: string;
  providerDbId?: number;
  lines: ScheduleARateLine[];
  importedFromScheduleAAt?: string;
  updatedAt?: string;
};
