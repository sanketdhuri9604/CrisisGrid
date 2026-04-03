'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Activity, ChevronDown, ShieldAlert, Users, Truck, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

export default function HeaderNav() {
  const { user, role, loading, logout } = useAuth();
  const router = useRouter();

  const [loginOpen, setLoginOpen] = useState(false);
  const [volunteerOpen, setVolunteerOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Click bahar ho toh dropdown band karo
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setLoginOpen(false);
        setVolunteerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const closeAll = () => {
    setLoginOpen(false);
    setVolunteerOpen(false);
  };

  return (
    <header className="glass" style={{ position: 'sticky', top: 0, zIndex: 100, borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, overflow: 'visible' }}>
      <div className="container flex items-center justify-between" style={{ padding: '1rem 1.5rem', flexWrap: 'wrap', gap: '1rem' }}>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Activity size={28} strokeWidth={2.5} color="var(--brand-danger)" />
          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            Crisis<span style={{ color: 'var(--brand-danger)' }}>Grid</span>
          </span>
        </Link>

        {/* FIX: ref hata diya yahan se */}
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>

          {/* 1. Send SOS — always visible */}
          <Link href="/sos" className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
            Send SOS
          </Link>

          {/* 2. Login dropdown — sirf logged out users ko */}
          {!loading && !user && (
            // FIX: ref aur zIndex yahan lagaya
            <div style={{ position: 'relative', zIndex: 200 }} ref={dropdownRef}>
              <button
                onClick={() => { setLoginOpen(p => !p); setVolunteerOpen(false); }}
                className="btn btn-secondary flex items-center gap-2"
                style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}
              >
                Login <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: loginOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </button>

              {loginOpen && (
                // FIX: zIndex 200 → 300
                <div className="glass" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: '200px', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.4)', zIndex: 300, padding: '0.5rem' }}>

                  {/* Admin option */}
                  <Link
                    href="/login"
                    onClick={closeAll}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', color: 'var(--text-primary)', textDecoration: 'none', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <ShieldAlert size={16} color="var(--brand-danger)" />
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem' }}>Admin</p>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Command center access</p>
                    </div>
                  </Link>

                  {/* Divider */}
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0.25rem 0' }} />

                  {/* Volunteer → nested */}
                  <div>
                    <button
                      onClick={() => setVolunteerOpen(p => !p)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', background: volunteerOpen ? 'rgba(255,255,255,0.06)' : 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => { if (!volunteerOpen) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Users size={16} color="var(--brand-primary)" />
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem' }}>Volunteer</p>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Choose your role</p>
                      </div>
                      <ChevronDown size={13} color="var(--text-secondary)" style={{ transition: 'transform 0.2s', transform: volunteerOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                    </button>

                    {/* Volunteer sub-options */}
                    {volunteerOpen && (
                      <div style={{ margin: '0.25rem 0 0.25rem 0.75rem', borderLeft: '2px solid rgba(59,130,246,0.3)', paddingLeft: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>

                        <Link
                          href="/volunteer"
                          onClick={closeAll}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: '8px', color: 'var(--text-primary)', textDecoration: 'none', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <Users size={14} color="var(--brand-success)" />
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.825rem' }}>Task Volunteer</p>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Field rescue missions</p>
                          </div>
                        </Link>

                        <Link
                          href="/pharmacy"
                          onClick={closeAll}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: '8px', color: 'var(--text-primary)', textDecoration: 'none', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <Truck size={14} color="var(--brand-warning)" />
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.825rem' }}>Pharmacy Volunteer</p>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Log & manage supplies</p>
                          </div>
                        </Link>

                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          )}

          {/* Logged in — role based nav */}
          {!loading && user && role === 'admin' && (
            <Link href="/dashboard" className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
              <ShieldAlert size={15} /> Admin
            </Link>
          )}
          {!loading && user && role === 'volunteer' && (
            <Link href="/volunteer" className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
              <Users size={15} /> My Missions
            </Link>
          )}
          {!loading && user && role === 'pharmacy' && (
            <Link href="/pharmacy" className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
              <Truck size={15} /> My Supplies
            </Link>
          )}
          {!loading && user && (
            <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
              Logout
            </button>
          )}

          {/* 3. Log Supplies — always visible, public page */}
          <Link href="/pharmacy?view=public" className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
            <ClipboardList size={15} /> Log Supplies
          </Link>

        </div>
      </div>
    </header>
  );
}