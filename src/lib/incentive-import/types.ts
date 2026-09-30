import type { CampaignStructureType } from '@/lib/incentive-campaigns';

export type SpiffImportLayout =
  | 'consolidated'
  | 'appdirect'
  | 'sandler'
  | 'portal_export'
  | 'generic'
  | 'pasted';

export const SPIFF_LAYOUT_LABEL: Record<SpiffImportLayout, string> = {
  consolidated: 'Consolidated SPIFFS',
  appdirect: 'AppDirect SPIFFs',
  sandler: 'Sandler SPIFFs',
  portal_export: 'Supplier portal SPIFF export',
  generic: 'Spreadsheet (columns matched by name)',
  pasted: 'Pasted text',
};

export type SpiffFlag = 'yes' | 'review' | 'no';

/** One spreadsheet row, normalized across layouts. Text is raw (not yet cleaned). */
export type RawSpiffRow = {
  rowNumber: number;
  sourceProgram?: string;
  provider?: string;
  category?: string;
  name?: string;
  description?: string;
  terms?: string;
  payout?: string;
  minMonthlyCharge?: string;
  minTerm?: string;
  payoutTimeline?: string;
  /** YYYY-MM-DD */
  startsOn?: string;
  /** YYYY-MM-DD */
  endsOn?: string;
  link?: string;
  /** Customer-facing copy already in the sheet (e.g. from an earlier manual pass). */
  prior?: {
    flag?: string;
    name?: string;
    description?: string;
    reward?: string;
    criteria?: string;
    adminNotes?: string;
  };
};

export type SpiffParseSheet = {
  name: string;
  layout: SpiffImportLayout | null;
  rowCount: number;
};

export type SpiffParseResult = {
  sheets: SpiffParseSheet[];
  sheetName: string | null;
  layout: SpiffImportLayout | null;
  sourceProgram?: string;
  rows: RawSpiffRow[];
};

export type SpiffDraft = {
  rowNumber: number;
  raw: RawSpiffRow;
  provider: string;
  sourceProgram?: string;
  importKey: string;
  flag: SpiffFlag;
  flagReason?: string;
  guardrailIssues: string[];
  category?: string;
  internalName?: string;
  internalDescription?: string;
  internalTerms?: string;
  adminNotes?: string;
  payoutRaw?: string;
  payoutType: CampaignStructureType | null;
  payoutValue: number | null;
  payoutUpTo: boolean;
  minMonthlyCharge: number | null;
  minTermMonths: number | null;
  payoutTimeline?: string;
  customerName: string;
  customerDescription: string;
  customerCriteria: string;
  startsOn?: string;
  endsOn?: string;
  link?: string;
  error?: string;
};

export type SpiffSaveRow = Omit<SpiffDraft, 'raw' | 'guardrailIssues' | 'error'> & {
  providerDbId: number;
};

export type SpiffSaveResult = {
  created: number;
  updated: number;
  errors: { rowNumber: number; error: string }[];
};

/** Rows per AI call; the client runs a few batches in parallel. */
export const SPIFF_REWRITE_BATCH = 8;

export const SPIFF_CATEGORIES = [
  'Voice & UCaaS',
  'Contact Center / CCaaS',
  'Network & Connectivity',
  'Cloud / Data Center',
  'Managed Services / IT',
  'AI',
  'Mobility',
  'Software',
  'Other',
] as const;
