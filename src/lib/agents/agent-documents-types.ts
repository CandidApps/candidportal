export type AgentDocumentType =
  | 'agency_agreement'
  | 'addendum'
  | 'w9'
  | 'ach_authorization'
  | 'nda'
  | 'commission_schedule'
  | 'other';

export const AGENT_DOCUMENT_TYPE_OPTIONS: { value: AgentDocumentType; label: string }[] = [
  { value: 'agency_agreement', label: 'Agency agreement' },
  { value: 'addendum', label: 'Addendum' },
  { value: 'w9', label: 'W-9' },
  { value: 'ach_authorization', label: 'ACH authorization' },
  { value: 'nda', label: 'NDA' },
  { value: 'commission_schedule', label: 'Commission schedule' },
  { value: 'other', label: 'Other' },
];

export type AgentDocument = {
  id: string;
  agentMergeKey: string;
  documentType: AgentDocumentType;
  filename: string;
  storagePath: string;
  uploadedBy: string;
  signedDate?: string;
  notes?: string;
  fileSizeLabel: string;
  createdAt: string;
};

export function agentDocumentTypeLabel(type: AgentDocumentType): string {
  return AGENT_DOCUMENT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export function formatAgentFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function guessAgentDocumentType(filename: string): AgentDocumentType {
  const name = filename.toLowerCase();
  if (/w-?9|w9/.test(name)) return 'w9';
  if (/addendum|amendment/.test(name)) return 'addendum';
  if (/ach|direct\s*deposit/.test(name)) return 'ach_authorization';
  if (/nda|non-?disclosure/.test(name)) return 'nda';
  if (/commission|comp\s*schedule|rate\s*sheet/.test(name)) return 'commission_schedule';
  if (/agency|agent\s*agreement|master\s*agent|referral/.test(name)) return 'agency_agreement';
  return 'other';
}
