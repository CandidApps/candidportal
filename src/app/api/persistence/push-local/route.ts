import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { LocalPersistenceSnapshot } from '@/lib/persistence/local-data-store';
import { isLocalhostRequestHost, isLocalPersistence } from '@/lib/persistence/config';
import { pushLocalSnapshotToDatabase } from '@/lib/persistence/push-local-to-database';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  if (!isLocalPersistence() || !isLocalhostRequestHost(request.headers.get('host'))) {
    return NextResponse.json(
      { error: 'Local data push is only available on localhost during development.' },
      { status: 403 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as LocalPersistenceSnapshot;
    if (!body || body.version !== 1) {
      return NextResponse.json({ error: 'Invalid local snapshot' }, { status: 400 });
    }

    const role = await getMyRole();
    const admin = createSupabaseAdminClient();
    const result = await pushLocalSnapshotToDatabase(admin, body, {
      userIdFilter: role === 'admin' ? undefined : user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Push failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
