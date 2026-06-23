import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { updateCustomerReminderStatus } from '@/lib/services/customer-reminders';
import type { CustomerReminderStatus } from '@/lib/customer-reminders/types';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as { status?: CustomerReminderStatus };
  if (!body.status || !['open', 'completed', 'cancelled'].includes(body.status)) {
    return NextResponse.json({ error: 'Valid status required' }, { status: 400 });
  }

  try {
    await updateCustomerReminderStatus(id, body.status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
