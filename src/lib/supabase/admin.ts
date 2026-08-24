import { createClient } from "@supabase/supabase-js";

/**
 * Prefer new secret key (`sb_secret_…` / SUPABASE_SECRET_KEY) over legacy
 * `SUPABASE_SERVICE_ROLE_KEY` JWT — the Vercel↔Supabase integration often
 * keeps syncing the disabled legacy JWT under the old name.
 */
function pickServiceKey(): string | undefined {
  const candidates = [
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ];
  const secret = candidates.find((v) => v?.trim().startsWith('sb_secret_'));
  if (secret) return secret.trim();
  const any = candidates.find((v) => Boolean(v?.trim()));
  return any?.trim();
}

function getAdminEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = pickServiceKey();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing admin Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)."
    );
  }

  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = getAdminEnv();
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
