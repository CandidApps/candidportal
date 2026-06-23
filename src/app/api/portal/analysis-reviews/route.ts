import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { mapReviewRow } from '@/lib/services/analysis-reviews';
import type { BillParseResult } from '@/lib/bill-parse-types';
import { finalizeBillParseResult } from '@/lib/bill-parse';
import { looksLikeGarbageVendorName } from '@/lib/bill-vendor-resolve';

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      accountServiceId?: string;
      vendorName?: string;
      filename?: string;
      billStoragePath?: string;
      parseResult?: unknown;
      customerEmail?: string;
      customerName?: string;
    };

    if (!body.accountServiceId || !body.parseResult) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const rawParse = body.parseResult as BillParseResult;
  const parseResult = finalizeBillParseResult(rawParse, {
    filename: body.filename,
    userLabel: body.vendorName,
  });
  const userVendor = body.vendorName?.trim();
  const vendorName =
    userVendor && !looksLikeGarbageVendorName(userVendor)
      ? userVendor
      : parseResult.vendorName ?? userVendor ?? 'Unknown vendor';
  const storedParse = { ...parseResult, vendorName };
    const category = String(parseResult.category ?? 'other');
    const categoryLabel = String(parseResult.categoryLabel ?? category);

    const { data, error } = await supabase
      .from('bill_analysis_reviews')
      .insert({
        user_id: user.id,
        account_service_id: body.accountServiceId,
        customer_email: body.customerEmail ?? user.email,
        customer_name: body.customerName ?? null,
        vendor_name: vendorName,
        filename: body.filename ?? null,
        bill_storage_path: body.billStoragePath ?? null,
        detected_category: category,
        category_label: categoryLabel,
        detected_categories: [category],
        parse_result: storedParse,
        status: 'pending_review',
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await supabase
      .from('account_services')
      .update({ analysis_review_id: data.id })
      .eq('id', body.accountServiceId);

    const serviceNameLooksPlaceholder =
      !userVendor || looksLikeGarbageVendorName(userVendor);
    if (serviceNameLooksPlaceholder && vendorName !== 'Unknown vendor') {
      await supabase
        .from('account_services')
        .update({ name: vendorName })
        .eq('id', body.accountServiceId);
    }

    return NextResponse.json({ review: mapReviewRow(data) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create review';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('bill_analysis_reviews')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.message.includes('bill_analysis_reviews')) {
      return NextResponse.json({ reviews: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reviews: (data ?? []).map(mapReviewRow) });
}
