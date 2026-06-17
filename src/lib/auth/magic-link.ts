'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export type MagicLinkResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function authCallbackUrl(next = '/app'): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function sendMagicLinkSignIn(
  email: string,
  options?: { next?: string; shouldCreateUser?: boolean },
): Promise<MagicLinkResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, message: 'Please enter your email address.' };
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: authCallbackUrl(options?.next ?? '/app'),
      shouldCreateUser: options?.shouldCreateUser ?? false,
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: `Check your email — we sent a sign-in link to ${trimmed}.`,
  };
}
