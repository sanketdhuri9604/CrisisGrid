import './globals.css';
import { AuthProvider } from './context/AuthContext';
import HeaderNav from './components/HeaderNav';
import PWAInstallBanner from './components/PWAInstallButton';
import ServiceWorkerRegister from './components/ServiceWorkerRegister';

export const metadata = {
  title: 'CrisisGrid | AI Emergency Response',
  description: 'Offline-first AI-powered emergency coordination for disasters. One tap SOS, real-time volunteer dispatch, medicine finder.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CrisisGrid',
  },
  formatDetection: { telephone: false },
  icons: {
    apple: '/icon-192.png',
  },
  openGraph: {
    title: 'CrisisGrid — Emergency Coordination',
    description: 'AI-powered offline-first emergency response platform.',
    type: 'website',
  },
};

export const viewport = {
  themeColor: '#ef4444',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CrisisGrid" />
        <meta name="color-scheme" content="dark" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <AuthProvider>
          <div className="ambient-background" />
          <ServiceWorkerRegister />
          <HeaderNav />

          <main style={{ minHeight: 'calc(100vh - 140px)' }}>
            {children}
          </main>

          {/* ── Premium Footer ── */}
          <footer style={{
            borderTop: '1px solid var(--glass-border)',
            padding: '2rem 0 2.5rem',
            marginTop: '4rem',
            background: 'rgba(2,6,16,0.6)',
            backdropFilter: 'blur(20px)',
          }}>
            <div className="container">
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
              }}>
                {/* Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--brand-danger)' }}>CG</span>
                  </div>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--text-primary)', margin: 0 }}>
                      Crisis<span style={{ color: 'var(--brand-danger)' }}>Grid</span>
                    </p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>AI Emergency Response Engine</p>
                  </div>
                </div>

                {/* SDG Badges */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {['SDG 9', 'SDG 11', 'SDG 13'].map(s => (
                    <span key={s} style={{ padding: '0.25rem 0.65rem', borderRadius: '50px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', fontSize: '0.68rem', fontWeight: 700, color: '#93c5fd', letterSpacing: '0.5px' }}>
                      {s}
                    </span>
                  ))}
                </div>

                {/* Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div className="pulse-dot green" />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    All systems operational
                  </span>
                </div>
              </div>
            </div>
          </footer>

          {/* Floating PWA banner */}
          <PWAInstallBanner />
        </AuthProvider>
      </body>
    </html>
  );
}