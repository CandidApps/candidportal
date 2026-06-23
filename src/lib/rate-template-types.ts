import type { ScheduleARateLine } from '@/lib/schedule-a-types';

export type RateTemplateRecord = {
  id: string;
  providerId: string;
  providerDbId?: number;
  name: string;
  lines: ScheduleARateLine[];
  isDefault: boolean;
  importedFromScheduleAAt?: string;
  updatedAt?: string;
};
