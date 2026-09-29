'use client';

const PENDING_KEY = 'candid:open-change-request';
export const OPEN_CHANGE_REQUEST_EVENT = 'candid:open-change-request';

/** Shareable deep link: Change queue with the CR selected. */
export function changeRequestHref(publicId: string): string {
  return `/admin?cr=${encodeURIComponent(publicId)}#roadmap`;
}

/** In-app navigation to the Change queue with `publicId` selected (no reload). */
export function openChangeRequest(publicId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_KEY, publicId);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(OPEN_CHANGE_REQUEST_EVENT, { detail: publicId }));
  if (window.location.hash.replace(/^#\/?/, '').split('?')[0] !== 'roadmap') {
    window.location.hash = 'roadmap';
  }
}

/** Reads and clears a pending CR to open (from `?cr=` or an in-app open). */
export function takePendingChangeRequest(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('cr');
  if (fromUrl) {
    url.searchParams.delete('cr');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
  let fromStorage: string | null = null;
  try {
    fromStorage = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
  return fromUrl || fromStorage;
}
