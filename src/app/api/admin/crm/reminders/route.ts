import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import {
  createCustomerReminder,
  listCustomerReminders,
} from '@/lib/services/customer-reminders';
import type { CreateCustomerReminderInput } from '@/lib/customer-reminders/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customerId = new URL(request.url).searchParams.get('customerId')?.trim();
  if (!customerId) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 });
  }

  try {
    const reminders = await listCustomerReminders(customerId);
    return NextResponse.json({ reminders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Load failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateCustomerReminderInput;
    if (!body.customerExternalId?.trim() || !body.title?.trim() || !body.kind) {
      return NextResponse.json({ error: 'customerExternalId, kind, and title required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const reminder = await createCustomerReminder(body, user?.id ?? null);
    return NextResponse.json({ reminder });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
