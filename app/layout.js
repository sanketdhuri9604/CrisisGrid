import './globals.css';
import Link from 'next/link';
import { Activity, ShieldAlert } from 'lucide-react';

export const metadata = {
  title: 'CrisisGrid - Emergency Coordination',
  description: 'Offline-first AI-powered coordination platform for disasters and emergencies.',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="ambient-background"></div>
        <header className="glass" style={{ position: 'sticky', top: 0, zIndex: 100, borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0 }}>
          <div className="container flex items-center justify-between" style={{ padding: '1rem 1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <Link href="/" className="flex items-center gap-2" style={{ color: 'var(--brand-danger)' }}>
              <Activity size={28} strokeWidth={2.5} />
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                Crisis<span style={{ color: 'var(--brand-danger)' }}>Grid</span>
              </span>
            </Link>
            
            <div className="flex items-center gap-4" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link href="/sos" className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>Send SOS</Link>
              <Link href="/dashboard" className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
                <ShieldAlert size={16}/> Admin
              </Link>
              <Link href="/volunteer" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>Volunteer Portal</Link>
              <Link href="/pharmacy" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>Log Supplies</Link>
            </div>
          </div>
        </header>

        <main style={{ minHeight: 'calc(100vh - 160px)' }}>
          {children}
        </main>

        <footer style={{ borderTop: '1px solid var(--glass-border)', padding: '2rem 0', marginTop: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div className="container">
            <p>CrisisGrid AI-Powered Response Engine</p>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Supporting SDG 9, 11, and 13.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
