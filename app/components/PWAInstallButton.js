'use client';

import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

/**
 * PWAInstallBanner
 * Floating bottom banner that appears 4s after page load when the app
 * is installable. The header button in HeaderNav handles the immediate
 * install action — this is the supplementary "reminder" banner.
 */
export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already installed or previously dismissed this session
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    // Check if user dismissed in this session
    const wasDismissed = sessionStorage.getItem('pwa-banner-dismissed');
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show banner after 4 seconds
      setTimeout(() => setShowBanner(true), 4000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
    } catch (e) {
      console.warn('Install prompt error:', e);
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem('pwa-banner-dismissed', '1');
  };

  if (isInstalled || !showBanner || dismissed) return null;

  return (
    <div
      id="pwa-install-banner"
      className="pwa-banner"
      style={{
        background: 'linear-gradient(135deg, rgba(10,15,28,0.97), rgba(15,22,40,0.97))',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(239,68,68,0.35)',
        borderRadius: '20px',
        padding: '1.25rem 1.5rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(239,68,68,0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      {/* Icon */}
      <div style={{
        width: '48px',
        height: '48px',
        minWidth: '48px',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05))',
        border: '1px solid rgba(239,68,68,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Smartphone size={22} color="var(--brand-danger)" />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 800, color: 'white', fontSize: '0.9rem', lineHeight: 1.3 }}>
          Install CrisisGrid
        </p>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          Offline SOS · One tap ready · Always available
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <button
          onClick={handleInstall}
          disabled={installing}
          id="pwa-install-confirm-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.55rem 1.1rem',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--brand-danger), #b91c1c)',
            border: 'none',
            color: 'white',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: installing ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
            transition: 'all 0.2s',
          }}
        >
          <Download size={14} />
          {installing ? 'Installing…' : 'Install'}
        </button>
        <button
          onClick={handleDismiss}
          id="pwa-install-dismiss-btn"
          title="Dismiss"
          style={{
            padding: '0.55rem',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
