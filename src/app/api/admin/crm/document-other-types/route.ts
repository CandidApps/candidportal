import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { fetchDocumentOtherTypeLabels } from '@/lib/crm/document-service-sync';

export async function GET(req: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const customerId = url.searchParams.get('customerId')?.trim();
  if (!customerId) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 });
  }

  const labels = await fetchDocumentOtherTypeLabels(customerId);
  return NextResponse.json({ labels });
}
