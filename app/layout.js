import './globals.css';
import { AuthProvider } from './context/AuthContext';
import HeaderNav from './components/HeaderNav'; // 👇 naya component

export const metadata = {
  title: 'CrisisGrid - Emergency Coordination',
  description: 'Offline-first AI-powered coordination platform for disasters and emergencies.',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="ambient-background"></div>
          <HeaderNav />
          <main style={{ minHeight: 'calc(100vh - 160px)' }}>
            {children}
          </main>
          <footer style={{ borderTop: '1px solid var(--glass-border)', padding: '2rem 0', marginTop: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div className="container">
              <p>CrisisGrid AI-Powered Response Engine</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Supporting SDG 9, 11, and 13.</p>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}