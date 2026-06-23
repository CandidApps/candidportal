/**
 * Supabase Storage object keys must not contain characters like [ ] ( ) or spaces.
 * Keep the original filename in the database for display; use these helpers for paths.
 */
export function safeStorageFileName(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || 'upload';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';

  const safeStem =
    stem
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 120) || 'upload';

  const safeExt = ext.replace(/[^a-zA-Z0-9.]+/g, '').slice(0, 12);

  return `${safeStem}${safeExt}`;
}

export function serviceBillStoragePath(
  userId: string,
  serviceId: string,
  filename: string,
): string {
  return `${userId}/${serviceId}/${safeStorageFileName(filename)}`;
}
