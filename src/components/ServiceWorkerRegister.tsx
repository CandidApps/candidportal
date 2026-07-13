'use client';

import { useEffect } from 'react';
import { initPwaInstallPromptCapture } from '@/lib/pwa-install-prompt';

/** Registers the PWA service worker so the app is installable + offline-aware (TASK-037). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    initPwaInstallPromptCapture();
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // The SW is registered in all environments so push notifications work in
    // local dev too. To avoid the stale-asset problem that cache-first static
    // handling caused in dev, sw.js goes network-only on localhost (it only
    // handles push there), so nothing is served from cache during development.
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => reg.update())
        .catch(() => {});
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
