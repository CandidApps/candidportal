'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

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

/**
 * Mobile install prompt for the Candid PWA. Android/Chrome uses the native
 * beforeinstallprompt flow; iOS shows Share → Add to Home Screen steps.
 */
export function PwaInstallSection() {
  const mobile = useMobileViewport();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const ios = isIosDevice();

  useEffect(() => {
    setInstalled(isStandaloneApp());

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onInstallPrompt);
  }, []);

  const install = useCallback(async () => {
    if (ios) {
      setShowIosHelp(true);
      return;
    }
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setDeferred(null);
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
            Candid is installed on this device. Open it from your home screen for the full app experience.
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
          disabled={busy || (!ios && !deferred)}
          onClick={() => void install()}
        >
          <AppIcon name="download" size={14} />
          {busy ? 'Adding…' : 'Add app to home screen'}
        </button>
        {!ios && !deferred && (
          <p style={{ fontSize: 12, color: 'var(--gray)', marginTop: 10, marginBottom: 0 }}>
            If the button stays disabled, open this page in Chrome and make sure you are signed in over HTTPS.
          </p>
        )}
        {showIosHelp && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 8,
              background: 'var(--gray-light)',
              border: '1px solid var(--gray-border)',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Add Candid on iPhone or iPad</div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Tap the <strong>Share</strong> button in Safari (square with an arrow).</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> in the top right.</li>
            </ol>
            <p style={{ margin: '10px 0 0', color: 'var(--gray)', fontSize: 12 }}>
              Push notifications on iOS only work after the app is added to your home screen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PwaInstallSection;
