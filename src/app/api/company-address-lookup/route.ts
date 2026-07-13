import { NextResponse } from 'next/server';
import { lookupCompanyProfile } from '@/lib/services/company-address-lookup';

export async function POST(req: Request) {
  let body: { website?: string; companyName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const website = String(body.website ?? '').trim();
  const companyName = String(body.companyName ?? '').trim();
  if (!website && !companyName) {
    return NextResponse.json({ error: 'website or companyName is required' }, { status: 400 });
  }

  try {
    const result = await lookupCompanyProfile({ website, companyName });
    return NextResponse.json(result);
  } catch (e) {
    console.error('[company-address-lookup]', e);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
