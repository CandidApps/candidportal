import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';

/** Legacy portal document URLs — forwards to the Supabase-backed CRM documents API. */
export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const file = new URL(request.url).searchParams.get('file');
  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const target = new URL('/api/admin/crm/documents', request.url);
  target.searchParams.set('file', file);
  return NextResponse.redirect(target);
}
