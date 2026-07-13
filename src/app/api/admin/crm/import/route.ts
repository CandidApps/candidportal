import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { CrmImportPayload } from '@/lib/crm/db-mapper';
import { persistCrmBulkImport } from '@/lib/crm/persist';

export const dynamic = 'force-dynamic';

type ImportBody = Pick<CrmImportPayload, 'customers' | 'locations' | 'contacts'>;

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    !Array.isArray(body.customers) ||
    !Array.isArray(body.locations) ||
    !Array.isArray(body.contacts)
  ) {
    return NextResponse.json({ error: 'Invalid import payload' }, { status: 400 });
  }

  try {
    const result = await persistCrmBulkImport({
      customers: body.customers,
      locations: body.locations,
      contacts: body.contacts,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 },
    );
  }
}
