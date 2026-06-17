import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import fs from 'fs';
import path from 'path';

const DOCS_DIR = path.join(process.cwd(), 'candid_portal_all_docs');

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
};

export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const recordId = searchParams.get('recordId');
  const file = searchParams.get('file');

  if (recordId) {
    return serveByRecordId(recordId);
  }

  if (file) {
    return serveLocalFile(file);
  }

  return NextResponse.json({ error: 'Provide recordId or file' }, { status: 400 });
}

async function serveByRecordId(recordId: string) {
  const admin = createSupabaseAdminClient();
  const { data: record, error } = await admin
    .from('customer_records')
    .select('filename, storage_path, local_filename')
    .eq('external_id', recordId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (record.storage_path) {
    const { data, error: downloadError } = await admin.storage
      .from('candid_documents')
      .download(record.storage_path);
    if (downloadError || !data) {
      return NextResponse.json({ error: downloadError?.message ?? 'Download failed' }, { status: 404 });
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    return fileResponse(record.filename, buffer);
  }

  const localName = record.local_filename ?? record.filename;
  return serveLocalFile(localName);
}

function serveLocalFile(filename: string) {
  const safeName = path.basename(filename);
  const fullPath = path.join(DOCS_DIR, safeName);
  if (!fullPath.startsWith(DOCS_DIR) || !fs.existsSync(fullPath)) {
    return NextResponse.json({ error: 'File missing' }, { status: 404 });
  }
  const buffer = fs.readFileSync(fullPath);
  return fileResponse(safeName, buffer);
}

function fileResponse(filename: string, buffer: Buffer) {
  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
