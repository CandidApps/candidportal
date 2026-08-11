/** Shared types for verified deposit-only commission sources (safe for server + client). */

export type PaySourceVerifiedEntry = {
  sourceKey: string;
  sourceLabel: string;
  period: string;
  depositAmount: number;
  lines: Array<{ dealUid: string; merchant: string; amount: number }>;
  verifiedAt: string;
};
