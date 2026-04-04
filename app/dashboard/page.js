'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert, Clock, MapPin, CheckCircle, AlertTriangle,
  UserCheck, LogOut, Phone, Trash2, Flag, RefreshCw, Activity,
  Power, PowerOff, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { auth, db } from '../utils/firebaseClient';
import { collection, onSnapshot, doc, getDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const Map = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => (
    <div className="glass" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading Map Engine...
    </div>
  ),
});

export default function Dashboard() {
  const router = useRouter();
  const [filter, setFilter] = useState('ALL');
  const [requests, setRequests] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [isAuthed, setIsAuthed] = useState(() => !auth);
  const [loading, setLoading] = useState(() => !!auth && !!db);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [actionLoading, setActionLoading] = useState(null); // id of request being acted on
  const unsubRefs = useRef([]);

  // ── Auth gate ──────────────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return; }
      if (db) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (!snap.exists() || snap.data().role !== 'admin') {
            await signOut(auth); router.push('/login'); return;
          }
        } catch {
          await signOut(auth); router.push('/login'); return;
        }
      }
      setIsAuthed(true);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const handleLogout = async () => {
    if (auth) await signOut(auth);
    router.push('/login');
  };

  // ── Real-time listeners ─────────────────────────────────────────
  useEffect(() => {
    if (!isAuthed || !db) return;

    const sosUnsub = onSnapshot(collection(db, 'sos_requests'), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.status !== 'cancelled') // hide cancelled
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setRequests(data);
      setLastUpdated(new Date());
      setLoading(false);
    }, () => setLoading(false));

    const volUnsub = onSnapshot(collection(db, 'volunteers'), (snap) => {
      setVolunteers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    unsubRefs.current = [sosUnsub, volUnsub];
    return () => unsubRefs.current.forEach(fn => fn());
  }, [isAuthed]);

  // ── Admin Actions ───────────────────────────────────────────────
  const handleResolve = async (req) => {
    if (!db || actionLoading) return;
    setActionLoading(req.id);
    try {
      await updateDoc(doc(db, 'sos_requests', req.id), {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: 'admin',
      });
    } catch (e) { console.error(e); }
    finally { setActionLoading(null); }
  };

  const handleFalseAlarm = async (req) => {
    if (!db || actionLoading) return;
    if (!confirm(`Mark "${req.type}" SOS as false alarm and delete it?`)) return;
    setActionLoading(req.id);
    try {
      await deleteDoc(doc(db, 'sos_requests', req.id));
    } catch (e) { console.error(e); }
    finally { setActionLoading(null); }
  };

  const handleReopen = async (req) => {
    if (!db || actionLoading) return;
    setActionLoading(req.id);
    try {
      await updateDoc(doc(db, 'sos_requests', req.id), {
        status: 'pending',
        assigned_volunteer: null,
        accepted_at: null,
        resolved_at: null,
      });
    } catch (e) { console.error(e); }
    finally { setActionLoading(null); }
  };

  // ── Admin: Toggle volunteer active/inactive ──────────────────────
  const handleToggleVolunteer = async (vol) => {
    if (!db || actionLoading) return;
    setActionLoading(vol.id);
    const next = vol.is_active === false ? true : false; // flip
    // Block deactivation if volunteer is on a mission
    if (!next) {
      const onMission = requests.find(r => r.assigned_volunteer?.id === vol.id && r.status === 'accepted');
      if (onMission) {
        alert(`⚠️ ${vol.name} is currently on a mission. Resolve or reopen that SOS first.`);
        setActionLoading(null);
        return;
      }
    }
    try {
      await setDoc(doc(db, 'volunteers', vol.id), {
        is_active: next,
        status: next ? 'Active' : 'Inactive',
        updated_at: new Date().toISOString(),
      }, { merge: true });
    } catch (e) { console.error(e); }
    finally { setActionLoading(null); }
  };

  // ── Filters ─────────────────────────────────────────────────────
  const displayedRequests = filter === 'ALL'
    ? requests
    : ['PENDING', 'ACCEPTED', 'RESOLVED'].includes(filter)
    ? requests.filter(r => r.status?.toUpperCase() === filter)
    : requests.filter(r => r.priority === filter);

  const pendingCount  = requests.filter(r => r.status === 'pending').length;
  const acceptedCount = requests.filter(r => r.status === 'accepted').length;
  const resolvedCount = requests.filter(r => r.status === 'resolved').length;
  const isHighRisk    = pendingCount > 2;
  const activeVolunteers   = volunteers.filter(v => v.is_active !== false).length;
  const inactiveVolunteers = volunteers.filter(v => v.is_active === false).length;

  const statusColor = (status) => {
    if (status === 'accepted') return 'var(--brand-warning)';
    if (status === 'resolved') return 'var(--brand-success)';
    return 'var(--brand-danger)';
  };
  const statusLabel = (status) => {
    if (status === 'accepted') return '⏳ Volunteer En Route';
    if (status === 'resolved') return '✓ Resolved';
    return '🔴 Awaiting Volunteer';
  };

  if (!isAuthed) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--brand-primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem auto' }} />
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container animate-fade-in" style={{ paddingTop: '2rem', paddingBottom: '3rem', maxWidth: '1400px' }}>
      <style>{`
        @keyframes heartbeat { 0%,100%{transform:scale(1)} 14%{transform:scale(1.15)} 28%{transform:scale(1)} 42%{transform:scale(1.1)} 70%{transform:scale(1)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @media (max-width: 768px) {
          .dashboard-topbar { flex-direction: column !important; align-items: flex-start !important; }
          .topbar-right { width: 100%; flex-wrap: wrap !important; }
          .filter-tabs { flex-wrap: wrap !important; width: 100% !important; }
          .filter-tabs button { flex: 1 1 auto !important; min-width: 60px !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 0.875rem !important; }
          .dashboard-main-grid { flex-direction: column !important; min-height: auto !important; }
          .dashboard-feed, .dashboard-sidebar { max-height: 420px !important; flex: none !important; width: 100% !important; }
          .dashboard-map { flex: none !important; width: 100% !important; min-height: 320px !important; height: 320px !important; }
        }
        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: 1fr 1fr !important; gap: 0.75rem !important; }
          .stats-grid .value { font-size: 2rem !important; }
          .dashboard-feed, .dashboard-sidebar { max-height: 360px !important; }
        }
      `}</style>

      {/* Top bar */}
      <div className="flex items-center justify-between dashboard-topbar" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="flex items-center gap-4">
          <div style={{ padding: '0.75rem', background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05))', borderRadius: '16px', border: '1px solid rgba(239,68,68,0.3)', boxShadow: '0 0 20px rgba(239,68,68,0.15)' }}>
            <ShieldAlert color="var(--brand-danger)" size={32} />
          </div>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }} className="text-gradient">
              Admin Command Center
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.6rem', background: db ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${db ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: '50px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: db ? 'var(--brand-success)' : 'var(--brand-warning)', animation: db ? 'heartbeat 2s infinite' : 'none' }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: db ? 'var(--brand-success)' : 'var(--brand-warning)', letterSpacing: '1px' }}>
                  {db ? 'LIVE SYNC' : 'OFFLINE'}
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {lastUpdated ? `Last ping: ${lastUpdated.toLocaleTimeString()}` : 'Connecting gateway...'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 topbar-right">
          {/* Filter tabs */}
          <div className="glass flex items-center filter-tabs" style={{ padding: '0.4rem', borderRadius: '12px', gap: '0.2rem', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
            {['ALL', 'HIGH', 'MEDIUM', 'PENDING', 'ACCEPTED', 'RESOLVED'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(59,130,246,0.1))' : 'transparent', border: filter === f ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent', color: filter === f ? 'white' : 'var(--text-secondary)', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', transition: 'all 0.2s', fontFamily: 'inherit' }}>
                {f}
              </button>
            ))}
          </div>
          <button onClick={handleLogout} style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '0.6rem 1rem', color: '#fca5a5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 700, transition: 'all 0.2s', fontFamily: 'inherit' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      {/* High risk banner */}
      {isHighRisk && (
        <div className="glass animate-slide-up" style={{ padding: '1rem 1.5rem', marginBottom: '2rem', background: 'linear-gradient(90deg, rgba(239,68,68,0.15), transparent)', border: '1px solid rgba(239,68,68,0.4)', borderLeft: '4px solid var(--brand-danger)', borderRadius: '12px' }}>
          <div className="flex items-center gap-4">
            <div style={{ padding: '0.5rem', background: 'rgba(239,68,68,0.2)', borderRadius: '50%', animation: 'pulseGlow 2s infinite' }}>
              <AlertTriangle size={24} color="#fca5a5" />
            </div>
            <div>
              <p style={{ color: '#fca5a5', fontWeight: 800, margin: 0, fontSize: '1.1rem', letterSpacing: '0.5px' }}>SYSTEM ALERT: REGIONAL OVERLOAD</p>
              <p style={{ margin: '0.2rem 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>{pendingCount} SOS requests are currently unassigned. Immediate manual intervention or volunteer dispatch overriding may be required.</p>
            </div>
          </div>
        </div>
      )}

      {/* Premium Stats Grid */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        {[
          { label: 'Total Distress Calls', value: requests.length, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', grad: 'linear-gradient(135deg, #60a5fa, #3b82f6)' },
          { label: 'Critical Pending', value: pendingCount, color: '#ef4444', bg: 'rgba(239,68,68,0.1)', grad: 'linear-gradient(135deg, #fca5a5, #ef4444)' },
          { label: 'Active Missions', value: acceptedCount, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', grad: 'linear-gradient(135deg, #fcd34d, #f59e0b)' },
          { label: 'Successfully Resolved', value: resolvedCount, color: '#10b981', bg: 'rgba(16,185,129,0.1)', grad: 'linear-gradient(135deg, #34d399, #10b981)' },
          { label: 'Active Personnel', value: activeVolunteers, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', grad: 'linear-gradient(135deg, #a78bfa, #8b5cf6)' },
          { label: 'Off Duty', value: inactiveVolunteers, color: '#6b7280', bg: 'rgba(107,114,128,0.1)', grad: 'linear-gradient(135deg, #9ca3af, #6b7280)' },
        ].map((s, i) => (
          <div key={s.label} className={`glass animate-slide-up delay-${i + 1}`} style={{ padding: '1.5rem', borderRadius: '16px', position: 'relative', overflow: 'hidden', border: `1px solid ${s.bg}` }}>
            <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', background: s.bg, borderRadius: '50%', filter: 'blur(20px)' }} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</p>
            <p style={{ fontSize: '3rem', fontWeight: 900, margin: 0, lineHeight: 1, background: s.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Main interface */}
      <div className="flex dashboard-main-grid" style={{ gap: '1.5rem', height: '700px', flexWrap: 'wrap' }}>

        {/* Cinematic SOS Feed */}
        <div className="dashboard-feed" style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', borderRadius: '20px', border: '1px solid var(--glass-border)', padding: '1rem', height: '100%' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
            <Activity size={18} color="var(--brand-primary)" /> Live Feed
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '4px', height: '100%' }}>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass" style={{ padding: '1.25rem', borderRadius: '14px' }}>
                  <div style={{ height: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', marginBottom: '0.8rem', width: '40%' }} />
                  <div style={{ height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', width: '90%' }} />
                </div>
              ))
            ) : displayedRequests.length === 0 ? (
              <div className="glass" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', borderRadius: '16px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <CheckCircle size={48} style={{ margin: '0 auto 1rem auto', color: 'var(--brand-success)', opacity: 0.3 }} />
                <p style={{ fontWeight: 700, fontSize: '1.1rem', color: 'white' }}>Sector Secure</p>
                <p style={{ fontSize: '0.85rem' }}>No SOS requests matching filter.</p>
              </div>
            ) : displayedRequests.map(req => (
              <div key={req.id} className="glass-card" style={{
                padding: '1.25rem', flexShrink: 0, borderRadius: '16px',
                background: req.status === 'pending' ? 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(13,19,31,0.6))' : 'rgba(13,19,31,0.55)',
                borderLeft: `4px solid ${req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)'}`,
                opacity: actionLoading === req.id ? 0.3 : 1,
              }}>
                {/* Priority + time */}
                <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '6px', background: req.priority === 'HIGH' ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : req.priority === 'MEDIUM' ? 'linear-gradient(135deg, #f59e0b, #b45309)' : 'linear-gradient(135deg, #10b981, #047857)', color: 'white', letterSpacing: '1px', boxShadow: `0 4px 10px rgba(0,0,0,0.2)` }}>
                    {req.priority || 'UNKNOWN'}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <Clock size={12} style={{ verticalAlign: 'text-top', marginRight: '4px' }} />
                    {req.created_at ? new Date(req.created_at).toLocaleTimeString() : 'Just now'}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.4rem', color: 'white' }}>{req.type || 'Emergency Signal'}</h3>

                {req.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#fca5a5', margin: '0.5rem 0', fontWeight: 700, padding: '0.4rem 0.6rem', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', width: 'fit-content' }}><Phone size={14} /> {req.phone}</div>}

                {req.description?.includes('📍 Location:') && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: '0.5rem 0', background: 'rgba(255,255,255,0.04)', padding: '0.6rem 0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <MapPin size={16} color="var(--brand-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span style={{ lineHeight: 1.4 }}>{req.description.split('📍 Location:')[1].trim()}</span>
                  </p>
                )}

                {req.notes && <p style={{ fontSize: '0.85rem', color: '#93c5fd', fontStyle: 'italic', margin: '0.5rem 0', padding: '0.5rem', borderLeft: '2px solid #3b82f6', background: 'rgba(59,130,246,0.05)' }}>&quot;{req.notes}&quot;</p>}

                {/* Assigned volunteer info */}
                {req.status === 'accepted' && req.assigned_volunteer && (
                  <div style={{ margin: '0.875rem 0', padding: '0.875rem', background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.02))', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px' }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 800, color: '#fcd34d', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 0.5rem' }}>Unit Dispatched</p>
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: '0.95rem', color: 'white', fontWeight: 800 }}>👤 {req.assigned_volunteer.name}</span>
                      {req.assigned_volunteer.phone && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--brand-success)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700 }}>
                          <Phone size={12} /> {req.assigned_volunteer.phone}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Status + GPS */}
                <div className="flex justify-between items-center" style={{ marginTop: '0.875rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(0,0,0,0.3)', padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
                    <MapPin size={12} color="var(--brand-primary)" />
                    {req.locationLabel || (req.lat && req.lng ? `${parseFloat(req.lat).toFixed(4)}°, ${parseFloat(req.lng).toFixed(4)}°` : 'No GPS Locked')}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: statusColor(req.status), padding: '0.3rem 0.75rem', background: `${statusColor(req.status)}20`, borderRadius: '50px', border: `1px solid ${statusColor(req.status)}50`, boxShadow: `0 0 10px ${statusColor(req.status)}30` }}>
                    {statusLabel(req.status)}
                  </span>
                </div>

                {/* ── Admin Action Buttons ── */}
                {req.status !== 'resolved' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <button
                      onClick={() => handleResolve(req)} disabled={actionLoading === req.id}
                      style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, transition: 'all 0.2s', fontFamily: 'inherit' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.25)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.15)'}
                    >
                      <CheckCircle size={15} /> Resolve
                    </button>
                    {req.status === 'accepted' && (
                      <button
                        onClick={() => handleReopen(req)} disabled={actionLoading === req.id}
                        style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#fcd34d', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, transition: 'all 0.2s', fontFamily: 'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.25)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.15)'}
                      >
                        <RefreshCw size={15} /> Reopen
                      </button>
                    )}
                    <button
                      onClick={() => handleFalseAlarm(req)} disabled={actionLoading === req.id}
                      style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, transition: 'all 0.2s', fontFamily: 'inherit' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                    >
                      <Trash2 size={15} /> False Alarm
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Global Map */}
        <div className="dashboard-map" style={{ flex: '2 1 400px', borderRadius: '20px', overflow: 'hidden', border: '1px solid var(--glass-border)', height: '100%', position: 'relative', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 1000, background: 'rgba(13,19,31,0.8)', backdropFilter: 'blur(10px)', padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--brand-primary)', animation: 'pulseGlow 2s infinite' }} />
            <span style={{ color: 'white', fontWeight: 800, fontSize: '0.85rem' }}>Global Theater</span>
          </div>
          <Map requests={displayedRequests} />
        </div>

        {/* Personnel status sidebar */}
        <div className="dashboard-sidebar" style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', borderRadius: '20px', border: '1px solid var(--glass-border)', padding: '1rem', height: '100%' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
            <UserCheck size={18} color="#a78bfa" /> Personnel ({activeVolunteers} active, {inactiveVolunteers} off duty)
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', overflowY: 'auto', paddingRight: '4px' }}>
            {volunteers.length === 0 ? (
              <div className="glass" style={{ padding: '2rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)' }}>No personnel synchronized.</div>
            ) : volunteers.map(vol => {
              const onMission = requests.find(r => r.assigned_volunteer?.id === vol.id && r.status === 'accepted');
              const isVolActive = vol.is_active !== false;
              const volStatus = onMission ? 'On Mission' : isVolActive ? 'Active' : 'Inactive';
              const trustColor = vol.trust_score >= 90 ? '#34d399' : vol.trust_score >= 70 ? '#fcd34d' : '#fca5a5';
              const statusColor = onMission ? '#fcd34d' : isVolActive ? '#34d399' : '#9ca3af';
              const statusBg    = onMission ? 'rgba(245,158,11,0.15)' : isVolActive ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.12)';
              const trustGrad   = vol.trust_score >= 90 ? 'linear-gradient(90deg, rgba(16,185,129,0.2), transparent)' : vol.trust_score >= 70 ? 'linear-gradient(90deg, rgba(245,158,11,0.2), transparent)' : 'linear-gradient(90deg, rgba(239,68,68,0.2), transparent)';
              
              return (
                <div key={vol.id} className="glass-card" style={{ padding: '1.25rem', borderRadius: '14px', borderLeft: `4px solid ${statusColor}`, background: trustGrad, opacity: actionLoading === vol.id ? 0.5 : 1 }}>
                  <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'white' }}>{vol.name}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 900, color: trustColor, background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>{vol.trust_score ?? 100}%</span>
                  </div>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.5rem', borderRadius: '6px', display: 'inline-block' }}>
                    {Array.isArray(vol.skills) ? vol.skills.join(' • ') : vol.skills || 'General Agent'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: statusColor, background: statusBg, padding: '0.25rem 0.6rem', borderRadius: '6px', border: `1px solid ${statusColor}40`, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {onMission ? <><Clock size={11}/> On Mission</> : isVolActive ? <><CheckCircle size={11}/> Active</> : <><PowerOff size={11}/> Off Duty</>}
                    </span>
                    <button
                      onClick={() => handleToggleVolunteer(vol)}
                      disabled={!!actionLoading || !!onMission}
                      title={onMission ? 'Cannot toggle while on mission' : isVolActive ? 'Deactivate volunteer' : 'Activate volunteer'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.25rem 0.6rem', borderRadius: '6px', cursor: actionLoading || onMission ? 'not-allowed' : 'pointer',
                        border: isVolActive ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(16,185,129,0.4)',
                        background: isVolActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        color: isVolActive ? '#fca5a5' : '#34d399',
                        fontSize: '0.7rem', fontWeight: 800, fontFamily: 'inherit',
                        transition: 'all 0.2s',
                        opacity: onMission ? 0.4 : 1,
                      }}
                    >
                      {isVolActive ? <><PowerOff size={11}/> Deactivate</> : <><Power size={11}/> Activate</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}