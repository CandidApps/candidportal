import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { loadCrmFromDatabase } from '@/lib/crm/load-from-db';
import { buildCrmSnapshot } from '@/lib/crm/snapshot';

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fromDb = await loadCrmFromDatabase();
    if (fromDb) {
      return NextResponse.json(fromDb);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CRM load failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const snapshot = buildCrmSnapshot();
  return NextResponse.json({
    source: 'local',
    customerCount: snapshot.customers.length,
    ...snapshot,
  });
}
