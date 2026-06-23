import { NextResponse } from 'next/server';
import type { Contact } from '@/components/CustomersView';
import { deleteCustomerContact, upsertCustomerContact } from '@/lib/crm/persist';
import { getMyRole } from '@/lib/auth/roles';

export async function PUT(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      customerId?: string;
      contact?: Contact;
    };

    if (!body.customerId || !body.contact?.id) {
      return NextResponse.json({ error: 'customerId and contact required' }, { status: 400 });
    }

    await upsertCustomerContact(body.customerId, body.contact);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId')?.trim();
    const contactId = searchParams.get('contactId')?.trim();

    if (!customerId || !contactId) {
      return NextResponse.json({ error: 'customerId and contactId required' }, { status: 400 });
    }

    await deleteCustomerContact(customerId, contactId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
