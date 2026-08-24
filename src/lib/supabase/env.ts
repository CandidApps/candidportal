/**
 * Resolve Supabase URL + browser/server anon-equivalent key.
 *
 * Prefer the new publishable key names the Supabase↔Vercel integration syncs.
 * Fall back to legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` for local `.env.local`.
 * Skip JWT `eyJ…` values when a publishable key is available — legacy keys may
 * be disabled in the Supabase dashboard while the integration still syncs them.
 */
function pickClientKey(): string | undefined {
  const candidates = [
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
  ];
  const publishable = candidates.find((v) => v?.trim().startsWith('sb_publishable_'));
  if (publishable) return publishable.trim();
  const any = candidates.find((v) => Boolean(v?.trim()));
  return any?.trim();
}

export function getSupabaseEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const anonKey = pickClientKey();

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).',
    );
  }

  return { url, anonKey };
}
