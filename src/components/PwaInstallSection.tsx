'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  clearDeferredPwaInstallPrompt,
  getDeferredPwaInstallPrompt,
  initPwaInstallPromptCapture,
  isAndroidDevice,
  isIosDevice,
  isStandaloneApp,
  pwaInstallAvailableEventName,
  subscribePwaInstallPrompt,
} from '@/lib/pwa-install-prompt';

function useMobileViewport(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px), (hover: none) and (pointer: coarse)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return mobile;
}

function InstallInstructions({
  ios,
  android,
}: {
  ios: boolean;
  android: boolean;
}) {
  if (ios) {
    return (
      <div className="pwa-install-help">
        <div className="pwa-install-help-title">Add Candid on iPhone or iPad</div>
        <ol className="pwa-install-help-steps">
          <li>
            Open this page in <strong>Safari</strong> (required for Add to Home Screen).
          </li>
          <li>
            Tap the <strong>Share</strong> button (square with an arrow).
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>.
          </li>
          <li>
            Tap <strong>Add</strong> in the top right.
          </li>
        </ol>
        <p className="pwa-install-help-note">
          Push notifications on iOS only work after the app is on your home screen.
        </p>
      </div>
    );
  }

  if (android) {
    return (
      <div className="pwa-install-help">
        <div className="pwa-install-help-title">Add Candid on Android</div>
        <ol className="pwa-install-help-steps">
          <li>
            Open this page in <strong>Chrome</strong> over HTTPS.
          </li>
          <li>
            Tap the <strong>menu</strong> (⋮) in the top right.
          </li>
          <li>
            Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </li>
          <li>Confirm when prompted.</li>
        </ol>
        <p className="pwa-install-help-note">
          If you don&apos;t see Install app, try refreshing once after signing in.
        </p>
      </div>
    );
  }

  return (
    <div className="pwa-install-help">
      <div className="pwa-install-help-title">Add Candid to your home screen</div>
      <p className="pwa-install-help-note" style={{ marginTop: 0 }}>
        Use your browser&apos;s menu to install or add this site to your home screen. On mobile,
        Safari (iOS) and Chrome (Android) work best.
      </p>
    </div>
  );
}

/**
 * Mobile install prompt for the Candid PWA. Android/Chrome uses the native
 * beforeinstallprompt flow when available; otherwise shows platform steps.
 */
export function PwaInstallSection() {
  const mobile = useMobileViewport();
  const [deferred, setDeferred] = useState(() => getDeferredPwaInstallPrompt());
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const ios = isIosDevice();
  const android = isAndroidDevice();

  useEffect(() => {
    initPwaInstallPromptCapture();
    setInstalled(isStandaloneApp());
    setDeferred(getDeferredPwaInstallPrompt());

    const sync = () => setDeferred(getDeferredPwaInstallPrompt());
    const unsub = subscribePwaInstallPrompt(sync);
    window.addEventListener(pwaInstallAvailableEventName(), sync);
    return () => {
      unsub();
      window.removeEventListener(pwaInstallAvailableEventName(), sync);
    };
  }, []);

  const install = useCallback(async () => {
    if (ios || !deferred) {
      setShowHelp(true);
      return;
    }

    setBusy(true);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        clearDeferredPwaInstallPrompt();
        setDeferred(null);
        setShowHelp(false);
      }
    } finally {
      setBusy(false);
    }
  }, [deferred, ios]);

  if (!mobile && !deferred) return null;

  if (installed) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-title">Mobile app</div>
        </div>
        <div className="card-body">
          <p className="settings-section-desc" style={{ color: 'var(--green)', margin: 0 }}>
            Candid is installed on this device. Open it from your home screen for the full app
            experience.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Mobile app</div>
      </div>
      <div className="card-body">
        <p className="settings-section-desc">
          Install Candid on your phone for quick access, full-screen mode, and push notifications
          {ios ? ' (after iOS 16.4+)' : ''}.
        </p>
        <button
          type="button"
          className="btn-primary settings-save-btn"
          disabled={busy}
          onClick={() => void install()}
        >
          <AppIcon name="download" size={14} />
          {busy ? 'Adding…' : deferred && !ios ? 'Add app to home screen' : 'Show install steps'}
        </button>
        {!deferred && !ios && (
          <p style={{ fontSize: 12, color: 'var(--gray)', marginTop: 10, marginBottom: 0 }}>
            Tap the button above for step-by-step instructions.
          </p>
        )}
        {showHelp && <InstallInstructions ios={ios} android={android} />}
      </div>
    </div>
  );
}

export default PwaInstallSection;
