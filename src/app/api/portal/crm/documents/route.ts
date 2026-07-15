import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';

export const dynamic = 'force-dynamic';

const DOCS_DIR = path.join(process.cwd(), 'candid_portal_all_docs');

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
};

/**
 * Member open/download for CRM contract documents belonging to their customer.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const recordId = searchParams.get('recordId');
  if (!recordId) return NextResponse.json({ error: 'recordId required' }, { status: 400 });

  const ctx = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: searchParams.get('customerId'),
  });
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const bareId = recordId.includes('::') ? recordId.split('::').slice(1).join('::') : recordId;
  let { data: record, error } = await admin
    .from('customer_records')
    .select('filename, storage_path, local_filename, customer_id, external_id, visible_in_portal')
    .eq('external_id', recordId)
    .maybeSingle();

  if (!record && bareId && bareId !== recordId) {
    const second = await admin
      .from('customer_records')
      .select('filename, storage_path, local_filename, customer_id, external_id, visible_in_portal')
      .eq('external_id', bareId)
      .eq('customer_id', ctx.customerUuid)
      .maybeSingle();
    record = second.data;
    error = second.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (record.visible_in_portal === false) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }
  if (String(record.customer_id) !== ctx.customerUuid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (record.storage_path) {
    const { data, error: downloadError } = await admin.storage
      .from('candid_documents')
      .download(record.storage_path);
    if (downloadError || !data) {
      return NextResponse.json(
        { error: downloadError?.message ?? 'Download failed' },
        { status: 404 },
      );
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
