'use client';

import { useEffect } from 'react';

/** Registers the PWA service worker so the app is installable + offline-aware (TASK-037). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // In development the SW's cache-first static handling serves stale JS/CSS
    // chunks across restarts, causing hydration mismatches. Don't register it,
    // and actively tear down any worker + caches a previous run left behind so
    // local dev always reflects the latest build.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      if ('caches' in window) {
        void caches.keys().then((keys) => {
          for (const k of keys) void caches.delete(k);
        });
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
