import CandidApp from '@/components/CandidApp';
import { AuthHashRecovery } from '@/components/auth/AuthHashRecovery';
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

  const tokenHash = typeof sp.token_hash === 'string' ? sp.token_hash : null;
  const otpType = typeof sp.type === 'string' ? sp.type : null;
  if (tokenHash && otpType) {
    const next = typeof sp.next === 'string' && sp.next.startsWith('/') ? sp.next : '/app';
    redirect(
      `/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(otpType)}&next=${encodeURIComponent(next)}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const role = await getMyRole();
    redirect(role === 'admin' ? '/admin' : '/app');
  }

  return (
    <>
      <AuthHashRecovery />
      <CandidApp signupPrefill={signupPrefill} />
    </>
  );
}
