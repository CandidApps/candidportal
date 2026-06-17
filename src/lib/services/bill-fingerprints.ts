import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

/** Fingerprint for duplicate bill detection (name + size + lastModified). */
export async function billFingerprint(file: File): Promise<string> {
  const base = `${file.name}|${file.size}|${file.lastModified}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = new TextEncoder().encode(base);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 24);
  }
  return base.replace(/[^a-zA-Z0-9|]/g, '').slice(0, 48);
}

export async function isDuplicateBill(userId: string, fingerprint: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('bill_upload_fingerprints')
    .select('id')
    .eq('user_id', userId)
    .eq('fingerprint', fingerprint)
    .maybeSingle();

  if (error) {
    console.error('isDuplicateBill', error);
    return false;
  }
  return Boolean(data);
}

export async function saveBillFingerprint(
  userId: string,
  fingerprint: string,
  originalFilename?: string
): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from('bill_upload_fingerprints').insert({
    user_id: userId,
    fingerprint,
    original_filename: originalFilename ?? null,
  });

  if (error && error.code !== '23505') {
    console.error('saveBillFingerprint', error);
  }
}
