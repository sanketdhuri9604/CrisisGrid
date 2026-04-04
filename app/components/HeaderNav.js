'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity, ChevronDown, ShieldAlert, Users, Truck,
  ClipboardList, AlertCircle, Menu, X, Download,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';

// ─── PWA Install Logic (hook) ─────────────────────────
function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Check if already running in standalone (installed) mode
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq.matches || window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }

    const handlePrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const triggerInstall = async () => {
    if (!deferredPrompt || installing) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setCanInstall(false);
        setDeferredPrompt(null);
      }
    } catch (e) {
      console.warn('PWA install failed:', e);
    } finally {
      setInstalling(false);
    }
  };

  return { canInstall, isInstalled, installing, triggerInstall };
}

// ─── PWA Install Button ───────────────────────────────
function InstallButton({ compact = false, onClick }) {
  const { canInstall, isInstalled, installing, triggerInstall } = usePWAInstall();

  if (isInstalled || !canInstall) return null;

  const handleClick = () => {
    triggerInstall();
    if (onClick) onClick();
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={installing}
        id="pwa-install-mobile-btn"
        className="mobile-menu-link"
        style={{ color: 'var(--brand-danger)' }}
      >
        <Download size={16} color="var(--brand-danger)" />
        {installing ? 'Installing…' : 'Install CrisisGrid App'}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={installing}
      id="pwa-install-header-btn"
      title="Install CrisisGrid App"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.45rem 0.9rem',
        borderRadius: '50px',
        background: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))',
        border: '1px solid rgba(239,68,68,0.4)',
        color: 'var(--brand-danger)',
        fontWeight: 700,
        fontSize: '0.8rem',
        cursor: installing ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.25s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239,68,68,0.28), rgba(239,68,68,0.12))';
        e.currentTarget.style.boxShadow = '0 0 20px rgba(239,68,68,0.25)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <Download size={13} />
      <span>{installing ? 'Installing…' : 'Install App'}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────
export default function HeaderNav() {
  const { user, role, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [loginOpen, setLoginOpen] = useState(false);
  const [volunteerOpen, setVolunteerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdowns on outside click
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
    setLoginOpen(false);
    setVolunteerOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    setMobileOpen(false);
    router.push('/');
  };

  const closeAll = () => {
    setLoginOpen(false);
    setVolunteerOpen(false);
    setMobileOpen(false);
  };

  const isHome = pathname === '/';

  return (
    <header
      className="glass header-nav"
      style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, overflow: 'visible' }}
    >
      {/* ── Desktop Header Row ── */}
      <div className="container header-inner">

        {/* Logo */}
        <Link href="/" className="header-logo" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', height: '100%' }}>
          <Activity size={24} strokeWidth={2.5} color="var(--brand-danger)" />
          <span className="header-logo-text" style={{ lineHeight: 1 }}>
            Crisis<span style={{ color: 'var(--brand-danger)' }}>Grid</span>
          </span>
        </Link>

        {/* Desktop Nav Actions */}
        <div className="header-actions" ref={dropdownRef}>

          {/* Install Button */}
          <InstallButton />

          {/* Send SOS */}
          <Link
            href="/"
            className="btn btn-primary"
            style={{
              padding: '0.45rem 1.1rem',
              fontSize: '0.875rem',
              background: isHome
                ? 'linear-gradient(135deg, #dc2626, #991b1b)'
                : 'linear-gradient(135deg, var(--brand-danger), #b91c1c)',
              boxShadow: isHome ? '0 0 20px rgba(239,68,68,0.5)' : undefined,
            }}
          >
            <AlertCircle size={15} /> Send SOS
          </Link>

          {/* Login dropdown — only for logged-out users */}
          {!loading && !user && (
            <div style={{ position: 'relative', zIndex: 200 }}>
              <button
                onClick={() => { setLoginOpen(p => !p); setVolunteerOpen(false); }}
                className="btn btn-secondary flex items-center gap-2"
                style={{ padding: '0.45rem 1.1rem', fontSize: '0.875rem' }}
              >
                Login <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: loginOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </button>

              {loginOpen && (
                <div className="glass" style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  minWidth: '210px', borderRadius: '14px', overflow: 'hidden',
                  boxShadow: '0 16px 48px rgba(0,0,0,0.4)', zIndex: 300, padding: '0.5rem',
                }}>
                  {/* Admin */}
                  <Link href="/login" onClick={closeAll}
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

                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0.25rem 0' }} />

                  {/* Volunteer subgroup */}
                  <div>
                    <button
                      onClick={() => setVolunteerOpen(p => !p)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', background: volunteerOpen ? 'rgba(255,255,255,0.06)' : 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', transition: 'background 0.15s', fontFamily: 'inherit' }}
                    >
                      <Users size={16} color="var(--brand-primary)" />
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem' }}>Volunteer</p>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Choose your role</p>
                      </div>
                      <ChevronDown size={13} color="var(--text-secondary)" style={{ transition: 'transform 0.2s', transform: volunteerOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                    </button>

                    {volunteerOpen && (
                      <div style={{ margin: '0.25rem 0 0.25rem 0.75rem', borderLeft: '2px solid rgba(59,130,246,0.3)', paddingLeft: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <Link href="/volunteer" onClick={closeAll}
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

                        <Link href="/pharmacy/login" onClick={closeAll}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: '8px', color: 'var(--text-primary)', textDecoration: 'none', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <Truck size={14} color="var(--brand-warning)" />
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.825rem' }}>Pharmacy / NGO</p>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Log &amp; manage supplies</p>
                          </div>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Logged-in role nav links */}
          {!loading && user && role === 'admin' && (
            <Link href="/dashboard" className="btn btn-secondary flex items-center gap-2"
              style={{ padding: '0.45rem 1.1rem', fontSize: '0.875rem', background: pathname === '/dashboard' ? 'rgba(255,255,255,0.1)' : '' }}>
              <ShieldAlert size={15} /> Admin
            </Link>
          )}
          {!loading && user && role === 'volunteer' && (
            <Link href="/volunteer" className="btn btn-secondary flex items-center gap-2"
              style={{ padding: '0.45rem 1.1rem', fontSize: '0.875rem', background: pathname === '/volunteer' ? 'rgba(255,255,255,0.1)' : '' }}>
              <Users size={15} /> My Missions
            </Link>
          )}
          {!loading && user && role === 'pharmacy' && (
            <Link href="/pharmacy" className="btn btn-secondary flex items-center gap-2"
              style={{ padding: '0.45rem 1.1rem', fontSize: '0.875rem', background: pathname === '/pharmacy' ? 'rgba(255,255,255,0.1)' : '' }}>
              <Truck size={15} /> My Supplies
            </Link>
          )}

          {/* View Supplies — for non-pharmacy visitors */}
          {!user && (
            <Link href="/pharmacy" className="btn btn-secondary flex items-center gap-2"
              style={{ padding: '0.45rem 1.1rem', fontSize: '0.875rem' }}>
              <ClipboardList size={15} /> View Supplies
            </Link>
          )}

          {/* Logout */}
          {!loading && user && (
            <button onClick={handleLogout} className="btn btn-secondary"
              style={{ padding: '0.45rem 1.1rem', fontSize: '0.875rem' }}>
              Logout
            </button>
          )}
        </div>

        {/* ── Mobile Right: SOS + Hamburger ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', height: '100%' }} className="mobile-right-group">
          {/* Compact SOS always visible */}
          <Link
            href="/"
            className="btn btn-primary"
            style={{
              padding: '0.45rem 1rem',
              fontSize: '0.85rem',
              display: 'none', // shown via CSS on mobile
              height: '36px',
              alignItems: 'center',
            }}
            id="mobile-sos-btn"
          >
            <AlertCircle size={15} /> SOS
          </Link>
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileOpen(p => !p)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            style={{ height: '36px', width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* ── Mobile Menu Drawer ── */}
      <div className={`mobile-menu ${mobileOpen ? 'open' : ''}`}>

        {/* SOS top */}
        <Link href="/" onClick={closeAll}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            padding: '0.875rem', borderRadius: '12px', fontWeight: 800, fontSize: '1rem',
            background: 'linear-gradient(135deg, var(--brand-danger), #b91c1c)',
            color: 'white', textDecoration: 'none',
            boxShadow: '0 6px 20px rgba(239,68,68,0.35)',
          }}
        >
          <AlertCircle size={18} /> Send Emergency SOS
        </Link>

        <div className="mobile-menu-divider" />

        {/* Not logged in */}
        {!loading && !user && (
          <>
            <Link href="/login" onClick={closeAll} className="mobile-menu-link">
              <ShieldAlert size={18} color="var(--brand-danger)" />
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>Admin Login</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Command center access</p>
              </div>
            </Link>
            <Link href="/volunteer" onClick={closeAll} className="mobile-menu-link">
              <Users size={18} color="var(--brand-primary)" />
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>Task Volunteer</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Field rescue missions</p>
              </div>
            </Link>
            <Link href="/pharmacy/login" onClick={closeAll} className="mobile-menu-link">
              <Truck size={18} color="var(--brand-warning)" />
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>Pharmacy / NGO</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Log &amp; manage supplies</p>
              </div>
            </Link>
            <Link href="/pharmacy" onClick={closeAll} className="mobile-menu-link">
              <ClipboardList size={18} color="var(--brand-success)" />
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>View Supplies</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Find medicine near you</p>
              </div>
            </Link>
          </>
        )}

        {/* Logged in */}
        {!loading && user && role === 'admin' && (
          <Link href="/dashboard" onClick={closeAll} className="mobile-menu-link">
            <ShieldAlert size={18} color="var(--brand-danger)" />
            <span style={{ fontWeight: 700 }}>Admin Dashboard</span>
          </Link>
        )}
        {!loading && user && role === 'volunteer' && (
          <Link href="/volunteer" onClick={closeAll} className="mobile-menu-link">
            <Users size={18} color="var(--brand-primary)" />
            <span style={{ fontWeight: 700 }}>My Missions</span>
          </Link>
        )}
        {!loading && user && role === 'pharmacy' && (
          <Link href="/pharmacy" onClick={closeAll} className="mobile-menu-link">
            <Truck size={18} color="var(--brand-warning)" />
            <span style={{ fontWeight: 700 }}>My Supplies</span>
          </Link>
        )}
        {!loading && user && (
          <>
            <div className="mobile-menu-divider" />
            <button onClick={handleLogout} className="mobile-menu-link"
              style={{ color: 'var(--brand-danger)' }}>
              <X size={18} color="var(--brand-danger)" />
              <span style={{ fontWeight: 700 }}>Logout</span>
            </button>
          </>
        )}

        <div className="mobile-menu-divider" />

        {/* Install PWA */}
        <InstallButton compact onClick={closeAll} />
      </div>

      {/* ── Mobile-only CSS injection ── */}
      <style>{`
        @media (max-width: 768px) {
          .header-actions { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
          #mobile-sos-btn { display: flex !important; }
          .mobile-right-group { gap: 0.4rem; }
        }
      `}</style>
    </header>
  );
}