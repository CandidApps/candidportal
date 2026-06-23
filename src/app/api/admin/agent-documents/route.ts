import { NextResponse } from 'next/server';
import path from 'path';
import { getMyRole } from '@/lib/auth/roles';
import {
  formatAgentFileSize,
  type AgentDocument,
  type AgentDocumentType,
} from '@/lib/agents/agent-documents-types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'candid_documents';
const ALLOWED_TYPES = new Set<AgentDocumentType>([
  'agency_agreement',
  'addendum',
  'w9',
  'ach_authorization',
  'nda',
  'commission_schedule',
  'other',
]);

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.csv': 'text/csv',
};

type DbAgentDocumentRow = {
  id: string;
  agent_merge_key: string;
  document_type: string;
  filename: string;
  storage_path: string;
  uploaded_by: string;
  signed_date: string | null;
  notes: string | null;
  file_size_label: string | null;
  created_at: string;
};

function rowToDocument(row: DbAgentDocumentRow): AgentDocument {
  return {
    id: row.id,
    agentMergeKey: row.agent_merge_key,
    documentType: row.document_type as AgentDocumentType,
    filename: row.filename,
    storagePath: row.storage_path,
    uploadedBy: row.uploaded_by,
    signedDate: row.signed_date ?? undefined,
    notes: row.notes ?? undefined,
    fileSizeLabel: row.file_size_label ?? '—',
    createdAt: row.created_at,
  };
}

function safeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId')?.trim();
  const agentMergeKey = searchParams.get('agentMergeKey')?.trim();

  if (documentId) {
    return serveDocument(documentId);
  }

  if (!agentMergeKey) {
    return NextResponse.json({ error: 'agentMergeKey or documentId required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('agent_documents')
      .select('*')
      .eq('agent_merge_key', agentMergeKey)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('agent_documents')) {
        return NextResponse.json({ documents: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      documents: (data as DbAgentDocumentRow[]).map(rowToDocument),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function serveDocument(documentId: string) {
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('agent_documents')
    .select('filename, storage_path')
    .eq('id', documentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row?.storage_path) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(row.storage_path);
  if (downloadError || !data) {
    return NextResponse.json({ error: downloadError?.message ?? 'Download failed' }, { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const ext = path.extname(row.filename).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${row.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const agentMergeKey = String(form.get('agentMergeKey') ?? '').trim();
    const documentType = String(form.get('documentType') ?? '').trim() as AgentDocumentType;
    const uploadedBy = String(form.get('uploadedBy') ?? 'Candid Team').trim() || 'Candid Team';
    const signedDate = String(form.get('signedDate') ?? '').trim() || null;
    const notes = String(form.get('notes') ?? '').trim() || null;
    const file = form.get('file');

    if (!agentMergeKey) {
      return NextResponse.json({ error: 'agentMergeKey required' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(documentType)) {
      return NextResponse.json({ error: 'Invalid documentType' }, { status: 400 });
    }
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const docId = crypto.randomUUID();
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]+/g, '_');
    const storagePath = `agents/${safeStorageSegment(agentMergeKey)}/${docId}/${safeName}`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || MIME[path.extname(safeName).toLowerCase()] || 'application/octet-stream',
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const fileSizeLabel = formatAgentFileSize(file.size);
    const { data, error } = await admin
      .from('agent_documents')
      .insert({
        id: docId,
        agent_merge_key: agentMergeKey,
        document_type: documentType,
        filename: file.name,
        storage_path: storagePath,
        uploaded_by: uploadedBy,
        signed_date: signedDate,
        notes,
        file_size_label: fileSizeLabel,
      })
      .select('*')
      .single();

    if (error) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      if (error.message.includes('agent_documents')) {
        return NextResponse.json(
          {
            error:
              'Agent documents table is not set up yet. Run migration 0014_agent_documents.sql in Supabase.',
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ document: rowToDocument(data as DbAgentDocumentRow) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const documentId = new URL(request.url).searchParams.get('documentId')?.trim();
  if (!documentId) {
    return NextResponse.json({ error: 'documentId required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: row, error: lookupError } = await admin
      .from('agent_documents')
      .select('storage_path')
      .eq('id', documentId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
    if (!row) return NextResponse.json({ ok: true });

    const { error: deleteError } = await admin.from('agent_documents').delete().eq('id', documentId);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    if (row.storage_path) {
      await admin.storage.from(BUCKET).remove([row.storage_path]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
