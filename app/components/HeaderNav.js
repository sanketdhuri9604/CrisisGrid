'use client';

import Link from 'next/link';
import { Activity, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

export default function HeaderNav() {
  const { user, role, loading, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="glass" style={{ position: 'sticky', top: 0, zIndex: 100, borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0 }}>
      <div className="container flex items-center justify-between" style={{ padding: '1rem 1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        
        <Link href="/" className="flex items-center gap-2" style={{ color: 'var(--brand-danger)' }}>
          <Activity size={28} strokeWidth={2.5} />
          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            Crisis<span style={{ color: 'var(--brand-danger)' }}>Grid</span>
          </span>
        </Link>

        <div className="flex items-center gap-4" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          
          {/* SOS — sabko dikhta hai */}
          <Link href="/sos" className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
            Send SOS
          </Link>

          {/* Sirf Admin ko */}
          {!loading && role === 'admin' && (
            <Link href="/dashboard" className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
              <ShieldAlert size={16} /> Admin
            </Link>
          )}

          {/* Sirf Volunteer ko */}
          {!loading && role === 'volunteer' && (
            <Link href="/volunteer" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
              Volunteer Portal
            </Link>
          )}

          {/* Sirf Pharmacy ko */}
         {!loading && (role === 'volunteer' || !user) && (
            <Link href="/pharmacy" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
              Log Supplies
            </Link>
          )}

          {/* Login/Logout */}
          {!loading && (
            user ? (
              <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
                Logout
              </button>
            ) : (
              <Link href="/login" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
                Login
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}