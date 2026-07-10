import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { loadDialpadCallsForCustomer, syncDialpadCalls } from '@/lib/dialpad/sync';

export const dynamic = 'force-dynamic';

/**
 * Contact-scoped Dialpad calls for Communications panels (Accounts / Suppliers).
 * Query: optional customerId (CRM external id), emails/phones CSV, sync=1, limit.
 * At least one of customerId, emails, or phones is required.
 */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId')?.trim() ?? '';
  const emails = (searchParams.get('emails') ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  const phones = (searchParams.get('phones') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (!customerId && !emails.length && !phones.length) {
    return NextResponse.json(
      { error: 'customerId, emails, or phones is required' },
      { status: 400 },
    );
  }

  const limit = Number(searchParams.get('limit') ?? '50') || 50;
  const shouldSync = searchParams.get('sync') === '1' || searchParams.get('sync') === 'true';

  if (shouldSync) {
    try {
      await syncDialpadCalls(14);
    } catch {
      /* best-effort; still return stored calls */
    }
  }

  const result = await loadDialpadCallsForCustomer({
    customerExternalId: customerId || undefined,
    emails,
    phones,
    limit,
  });

  return NextResponse.json(result);
}
