import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { loadDefaultOurRateRecord, saveDefaultProviderRateLines } from '@/lib/provider-default-rates';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providerKey = new URL(request.url).searchParams.get('providerId')?.trim();
  if (!providerKey) {
    return NextResponse.json({ error: 'providerId required' }, { status: 400 });
  }

  try {
    const ourRates = await loadDefaultOurRateRecord(providerKey);
    return NextResponse.json({ ourRates });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Load failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      providerId?: string;
      lines?: ScheduleARateLine[];
      importedFromScheduleA?: boolean;
    };

    if (!body.providerId?.trim() || !body.lines) {
      return NextResponse.json({ error: 'providerId and lines required' }, { status: 400 });
    }

    await saveDefaultProviderRateLines(body.providerId, body.lines, body.importedFromScheduleA);
    const ourRates = await loadDefaultOurRateRecord(body.providerId);
    if (!ourRates) {
      return NextResponse.json({ error: 'Save failed' }, { status: 500 });
    }

    return NextResponse.json({ ourRates });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
