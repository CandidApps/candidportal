import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { loadCrmFromDatabase } from '@/lib/crm/load-from-db';

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await loadCrmFromDatabase();
    if (!data) {
      return NextResponse.json(
        {
          error: 'CRM not loaded',
          message:
            'No customer data in Supabase yet. Run npm run import-crm on a machine with source data.',
          source: 'empty',
          ready: false,
          customerCount: 0,
          customers: [],
          documentsByCustomerId: {},
          contractsByCustomerId: {},
          bmwDeals: [],
          agentRates: [],
        },
        { status: 200 },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CRM load failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
