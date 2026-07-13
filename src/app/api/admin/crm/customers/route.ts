import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { Customer, Location } from '@/components/CustomersView';
import type { CustomerDocument } from '@/lib/customer-records';
import {
  archiveCustomer,
  createCrmCustomer,
  persistCustomerRecord,
  restoreCustomer,
  updateCustomerProfile,
  type CustomerProfilePersistPatch,
} from '@/lib/crm/persist';

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      customer?: Customer;
      document?: CustomerDocument;
    };

    if (!body.customer?.id || !body.customer.company?.trim()) {
      return NextResponse.json({ error: 'customer with id and company required' }, { status: 400 });
    }

    await createCrmCustomer(body.customer);

    if (body.document) {
      await persistCustomerRecord({
        customerExternalId: body.customer.id,
        document: body.document,
      });
    }

    return NextResponse.json({ ok: true, customerId: body.customer.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      customerId?: string;
      op?: 'archive' | 'restore';
      website?: string;
      mccCode?: string;
      location?: Location;
    };

    if (!body.customerId) {
      return NextResponse.json({ error: 'customerId required' }, { status: 400 });
    }

    if (body.op === 'archive') {
      await archiveCustomer(body.customerId);
      return NextResponse.json({ ok: true });
    }

    if (body.op === 'restore') {
      await restoreCustomer(body.customerId);
      return NextResponse.json({ ok: true });
    }

    const patch: CustomerProfilePersistPatch = {};
    if (body.website !== undefined) patch.website = body.website;
    if (body.mccCode !== undefined) patch.mccCode = body.mccCode;
    if (body.location) patch.location = body.location;

    if (!patch.website && !patch.mccCode && !patch.location) {
      return NextResponse.json({ error: 'No profile fields to update' }, { status: 400 });
    }

    await updateCustomerProfile(body.customerId, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
