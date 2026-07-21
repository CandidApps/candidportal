import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import type { QuoteRequestLocation } from '@/lib/services/quote-requests';

export const dynamic = 'force-dynamic';

type PatchBody = {
  serviceAnswers?: Record<string, string | boolean>;
  location?: QuoteRequestLocation | null;
  draftQuoteSnapshot?: PublishedQuoteSnapshot | null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.serviceAnswers !== undefined) update.service_answers = body.serviceAnswers;
  if (body.location !== undefined) update.location = body.location;
  if (body.draftQuoteSnapshot !== undefined) update.draft_quote_snapshot = body.draftQuoteSnapshot;
  if (body.serviceAnswers?.internetConnectionTypes !== undefined) {
    update.service_type_id = 'internet';
  }

  const { error } = await admin.from('quote_requests').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
