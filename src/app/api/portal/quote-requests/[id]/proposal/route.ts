import { NextResponse } from 'next/server';
import path from 'path';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { assertPortalQuoteRequestAccess } from '@/lib/portal/quote-access';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';

export const dynamic = 'force-dynamic';

const BUCKET = 'service-bills';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function resolveStoragePath(
  snapshot: PublishedQuoteSnapshot | null,
  explicitPath: string | null,
): { storagePath: string; filename: string; mimeType: string } | null {
  const fromQuery = explicitPath?.trim();
  if (fromQuery?.startsWith('quote-proposals/')) {
    const filename = fromQuery.split('/').pop() ?? 'quote.pdf';
    const ext = path.extname(filename).toLowerCase();
    return {
      storagePath: fromQuery,
      filename,
      mimeType: MIME[ext] ?? 'application/octet-stream',
    };
  }

  const doc = snapshot?.proposalDocument;
  if (!doc?.storagePath?.startsWith('quote-proposals/')) return null;
  const filename = doc.filename ?? doc.name ?? doc.storagePath.split('/').pop() ?? 'quote.pdf';
  const ext = path.extname(filename).toLowerCase();
  return {
    storagePath: doc.storagePath,
    filename,
    mimeType: doc.mimeType ?? MIME[ext] ?? 'application/octet-stream',
  };
}

/** Portal member download for a published quote proposal PDF/document. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const access = await assertPortalQuoteRequestAccess({
    quoteRequestId: id,
    userId: user.id,
    email: user.email,
    customerExternalId: url.searchParams.get('customerId'),
    requirePublished: true,
  });
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const snapshot = access.row.published_quote_snapshot as PublishedQuoteSnapshot | null;
  const resolved = resolveStoragePath(snapshot, url.searchParams.get('path'));
  if (!resolved) {
    return NextResponse.json({ error: 'No proposal document' }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(resolved.storagePath);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': resolved.mimeType,
      'Content-Disposition': `inline; filename="${resolved.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
