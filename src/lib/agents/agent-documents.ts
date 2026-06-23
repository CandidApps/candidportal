import type { AgentDocument, AgentDocumentType } from '@/lib/agents/agent-documents-types';

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export function agentDocumentViewUrl(documentId: string): string {
  return `/api/admin/agent-documents?documentId=${encodeURIComponent(documentId)}`;
}

export async function listAgentDocuments(agentMergeKey: string): Promise<AgentDocument[]> {
  const params = new URLSearchParams({ agentMergeKey });
  const res = await fetch(`/api/admin/agent-documents?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { documents?: AgentDocument[] };
  return data.documents ?? [];
}

export async function uploadAgentDocument(params: {
  agentMergeKey: string;
  file: File;
  documentType: AgentDocumentType;
  uploadedBy: string;
  signedDate?: string;
  notes?: string;
}): Promise<AgentDocument> {
  const form = new FormData();
  form.set('agentMergeKey', params.agentMergeKey);
  form.set('documentType', params.documentType);
  form.set('uploadedBy', params.uploadedBy);
  if (params.signedDate) form.set('signedDate', params.signedDate);
  if (params.notes) form.set('notes', params.notes);
  form.set('file', params.file);

  const res = await fetch('/api/admin/agent-documents', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { document?: AgentDocument };
  if (!data.document) throw new Error('Upload failed');
  return data.document;
}

export async function deleteAgentDocument(documentId: string): Promise<void> {
  const params = new URLSearchParams({ documentId });
  const res = await fetch(`/api/admin/agent-documents?${params.toString()}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}
