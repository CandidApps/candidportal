import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { bookBillMeeting } from '@/lib/services/bill-meeting-booking';

export const dynamic = 'force-dynamic';

/** Book a bill-analysis discovery call with a Candid specialist. */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    specialistId?: string;
    startISO?: string;
    endISO?: string;
    customerName?: string;
    customerEmail?: string;
    vendorName?: string | null;
    analysisReviewId?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!body.specialistId?.trim() || !body.startISO || !body.endISO) {
    return NextResponse.json({ error: 'specialistId, startISO, and endISO are required' }, { status: 400 });
  }

  const customerName = body.customerName?.trim() || user.user_metadata?.display_name || user.email?.split('@')[0] || 'Customer';
  const customerEmail = body.customerEmail?.trim() || user.email;
  if (!customerEmail) {
    return NextResponse.json({ error: 'customerEmail is required' }, { status: 400 });
  }

  try {
    const result = await bookBillMeeting({
      userId: user.id,
      specialistId: body.specialistId.trim(),
      startISO: body.startISO,
      endISO: body.endISO,
      customerName,
      customerEmail,
      vendorName: body.vendorName ?? null,
      analysisReviewId: body.analysisReviewId ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Booking failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
