import { NextResponse } from 'next/server';
import path from 'path';
import { getMyRole } from '@/lib/auth/roles';
import {
  COMMISSION_PARTNER_DOCUMENT_OPTIONS,
  formatRegistryFileSize,
  SOLUTION_PROVIDER_DOCUMENT_OPTIONS,
  type RegistryDocument,
  type RegistryDocumentType,
  type RegistryEntityType,
} from '@/lib/registry-documents-types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'candid_documents';

const ALLOWED_TYPES = new Set<string>([
  ...COMMISSION_PARTNER_DOCUMENT_OPTIONS.map((o) => o.value),
  ...SOLUTION_PROVIDER_DOCUMENT_OPTIONS.map((o) => o.value),
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

type DbRegistryDocumentRow = {
  id: string;
  entity_type: string;
  entity_key: string;
  document_type: string;
  filename: string;
  storage_path: string;
  uploaded_by: string;
  signed_date: string | null;
  notes: string | null;
  file_size_label: string | null;
  created_at: string;
};

function rowToDocument(row: DbRegistryDocumentRow): RegistryDocument {
  return {
    id: row.id,
    entityType: row.entity_type as RegistryEntityType,
    entityKey: row.entity_key,
    documentType: row.document_type as RegistryDocumentType,
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

function storagePrefix(entityType: RegistryEntityType): string {
  return entityType === 'commission_partner' ? 'commission-partners' : 'solution-providers';
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId')?.trim();
  const entityType = searchParams.get('entityType')?.trim() as RegistryEntityType | undefined;
  const entityKey = searchParams.get('entityKey')?.trim();

  if (documentId) {
    return serveDocument(documentId);
  }

  if (!entityType || !entityKey) {
    return NextResponse.json({ error: 'entityType and entityKey, or documentId required' }, { status: 400 });
  }
  if (entityType !== 'commission_partner' && entityType !== 'solution_provider') {
    return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('registry_documents')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_key', entityKey)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('registry_documents')) {
        return NextResponse.json({ documents: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      documents: (data as DbRegistryDocumentRow[]).map(rowToDocument),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function serveDocument(documentId: string) {
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('registry_documents')
    .select('filename, storage_path')
    .eq('id', documentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row?.storage_path) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error: downloadError } = await admin.storage.from(BUCKET).download(row.storage_path);
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
    const entityType = String(form.get('entityType') ?? '').trim() as RegistryEntityType;
    const entityKey = String(form.get('entityKey') ?? '').trim();
    const documentType = String(form.get('documentType') ?? '').trim();
    const uploadedBy = String(form.get('uploadedBy') ?? 'Candid Team').trim() || 'Candid Team';
    const signedDate = String(form.get('signedDate') ?? '').trim() || null;
    const notes = String(form.get('notes') ?? '').trim() || null;
    const file = form.get('file');

    if (!entityKey) {
      return NextResponse.json({ error: 'entityKey required' }, { status: 400 });
    }
    if (entityType !== 'commission_partner' && entityType !== 'solution_provider') {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
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
    const storagePath = `${storagePrefix(entityType)}/${safeStorageSegment(entityKey)}/${docId}/${safeName}`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, fileBuffer, {
      contentType: file.type || MIME[path.extname(safeName).toLowerCase()] || 'application/octet-stream',
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const fileSizeLabel = formatRegistryFileSize(file.size);
    const { data, error } = await admin
      .from('registry_documents')
      .insert({
        id: docId,
        entity_type: entityType,
        entity_key: entityKey,
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
      if (error.message.includes('registry_documents')) {
        return NextResponse.json(
          {
            error:
              'Registry documents table is not set up yet. Run migration 0015_registry_documents.sql in Supabase.',
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ document: rowToDocument(data as DbRegistryDocumentRow) });
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
      .from('registry_documents')
      .select('storage_path')
      .eq('id', documentId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
    if (!row) return NextResponse.json({ ok: true });

    const { error: deleteError } = await admin.from('registry_documents').delete().eq('id', documentId);
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
