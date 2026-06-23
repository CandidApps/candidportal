import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadMerchantAnalysisProviders } from '@/lib/analysis/merchant-analysis-providers';

/** Member-facing sell rates for merchant services savings analysis (never Schedule A buy rates). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const providers = await loadMerchantAnalysisProviders();
    return NextResponse.json({ providers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load analysis providers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
