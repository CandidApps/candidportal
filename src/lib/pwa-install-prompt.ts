export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const INSTALL_EVENT = 'candid-pwa-install-available';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Call once at app startup so we don't miss beforeinstallprompt before Settings opens. */
export function initPwaInstallPromptCapture(): void {
  if (typeof window === 'undefined') return;

  const existing = (window as Window & { __candidDeferredInstall?: BeforeInstallPromptEvent })
    .__candidDeferredInstall;
  if (existing) {
    deferredPrompt = existing;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    const prompt = event as BeforeInstallPromptEvent;
    deferredPrompt = prompt;
    (window as Window & { __candidDeferredInstall?: BeforeInstallPromptEvent }).__candidDeferredInstall =
      prompt;
    for (const listener of listeners) listener();
    window.dispatchEvent(new Event(INSTALL_EVENT));
  });
}

export function getDeferredPwaInstallPrompt(): BeforeInstallPromptEvent | null {
  if (deferredPrompt) return deferredPrompt;
  if (typeof window === 'undefined') return null;
  return (
    (window as Window & { __candidDeferredInstall?: BeforeInstallPromptEvent }).__candidDeferredInstall ??
    null
  );
}

export function clearDeferredPwaInstallPrompt(): void {
  deferredPrompt = null;
  if (typeof window !== 'undefined') {
    delete (window as Window & { __candidDeferredInstall?: BeforeInstallPromptEvent })
      .__candidDeferredInstall;
  }
  for (const listener of listeners) listener();
}

export function subscribePwaInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pwaInstallAvailableEventName(): string {
  return INSTALL_EVENT;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
