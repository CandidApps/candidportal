import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** Portal auth user id for a contact email, if they have signed up. */
export async function resolvePortalUserIdByEmail(email: string | null | undefined): Promise<string | null> {
  const trimmed = email?.trim();
  if (!trimmed) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from('profiles').select('id').ilike('email', trimmed).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
