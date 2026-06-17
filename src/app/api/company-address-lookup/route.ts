import { NextResponse } from 'next/server';
import { lookupCompanyAddressFromWebsite } from '@/lib/services/company-address-lookup';

export async function POST(req: Request) {
  let body: { website?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const website = String(body.website ?? '').trim();
  if (!website) {
    return NextResponse.json({ error: 'website is required' }, { status: 400 });
  }

  try {
    const result = await lookupCompanyAddressFromWebsite(website);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[company-address-lookup]', e);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
