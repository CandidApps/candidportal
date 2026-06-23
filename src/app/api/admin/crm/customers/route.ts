import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { Location } from '@/components/CustomersView';
import { updateCustomerProfile, type CustomerProfilePersistPatch } from '@/lib/crm/persist';

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      customerId?: string;
      website?: string;
      mccCode?: string;
      location?: Location;
    };

    if (!body.customerId) {
      return NextResponse.json({ error: 'customerId required' }, { status: 400 });
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
