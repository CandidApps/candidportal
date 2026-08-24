'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { userNeedsPasswordSetup } from '@/lib/auth/password-meta';

export { userNeedsPasswordSetup };

export const MIN_PASSWORD_LENGTH = 8;

export async function updateAccountPassword(opts: {
  mode: 'create' | 'change';
  email?: string;
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const next = opts.newPassword;
  const confirm = opts.confirmPassword;

  if (next.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (next !== confirm) {
    return { ok: false, message: 'Passwords do not match.' };
  }

  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: 'Your session expired. Sign in again and retry.' };
  }

  if (opts.mode === 'change') {
    const current = opts.currentPassword?.trim();
    if (!current) {
      return { ok: false, message: 'Enter your current password.' };
    }
    const email = opts.email?.trim() || user.email;
    if (!email) {
      return { ok: false, message: 'Could not verify your account email.' };
    }
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (verifyErr) {
      return { ok: false, message: 'Current password is incorrect.' };
    }
  }

  const { error } = await supabase.auth.updateUser({
    password: next,
    data: { needs_password_setup: false },
  });
  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}
