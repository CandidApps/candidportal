/**
 * Normalize a website URL for CRM storage.
 * Strips a trailing slash when nothing follows it (e.g. example.com/ → example.com,
 * example.com/about/ → example.com/about).
 */
export function normalizeWebsiteUrl(input?: string | null): string | undefined {
  const trimmed = input?.trim();
  if (!trimmed) return undefined;

  const hadProtocol = /^https?:\/\//i.test(trimmed);
  const parseable = hadProtocol ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(parseable);
    let path = url.pathname + url.search + url.hash;
    if (path === '/' || path === '') {
      path = '';
    } else if (path.endsWith('/')) {
      path = path.replace(/\/+$/, '');
    }

    const needsPort =
      url.port &&
      ((url.protocol === 'http:' && url.port !== '80') ||
        (url.protocol === 'https:' && url.port !== '443'));
    const host = `${url.hostname}${needsPort ? `:${url.port}` : ''}`;

    if (hadProtocol) {
      return `${url.protocol}//${host}${path}`;
    }
    return `${host}${path}`;
  } catch {
    const withoutTrailing = trimmed.replace(/\/+$/, '');
    return withoutTrailing || undefined;
  }
}

export function normalizeWebsiteUrlOrNull(input?: string | null): string | null {
  return normalizeWebsiteUrl(input) ?? null;
}
