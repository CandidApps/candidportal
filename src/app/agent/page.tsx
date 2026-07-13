import AgentApp from '@/components/AgentApp';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

async function signOut() {
  'use server';
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}

export default async function AgentPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await getMyRole();
  if (role === 'admin') redirect('/admin');
  if (role !== 'agent') redirect('/app');

  return (
    <AgentApp
      sessionUser={{
        email: user.email ?? '',
        name: (user.user_metadata?.full_name as string | undefined) ?? null,
      }}
      signOutAction={signOut}
    />
  );
}
