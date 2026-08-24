'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

/** Recover sessions from legacy Supabase verify redirects that land on `/` with hash tokens. */
export function AuthHashRecovery() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token=')) return;

    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      router.replace('/app');
      router.refresh();
    });
  }, [router]);

  return null;
}
