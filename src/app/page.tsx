import CandidApp from '@/components/CandidApp';
import { getMyRole } from '@/lib/auth/roles';
import { parseSignupPrefill } from '@/lib/marketing/signup';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * PWA start_url is `/`. If a session cookie is still valid (normal after closing
 * the installed app), send the user straight into the app instead of the login
 * screen.
 */
export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const signupPrefill = parseSignupPrefill(sp);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const role = await getMyRole();
    redirect(role === 'admin' ? '/admin' : '/app');
  }

  return <CandidApp signupPrefill={signupPrefill} />;
}
