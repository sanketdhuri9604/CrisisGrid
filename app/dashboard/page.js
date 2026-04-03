'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Filter, Clock, MapPin, CheckCircle, AlertTriangle, UserCheck, RefreshCw, LogOut } from 'lucide-react';
import { auth, db } from '../utils/firebaseClient';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const Map = dynamic(() => import('../components/Map'), { ssr: false, loading: () => <div className="glass" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading Map Engine...</div> });

export default function Dashboard() {
  const router = useRouter();
  const [filter, setFilter] = useState('ALL');
  const [requests, setRequests] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!auth) {
      // No Firebase Auth — allow access in offline demo mode
      setIsAuthed(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthed(true);
        setUserEmail(user.email || '');
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    if (auth) await signOut(auth);
    router.push('/login');
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Always read localStorage first (works even without Firestore data)
      const local = JSON.parse(localStorage.getItem('local_sos_requests') || '[]');

      if (db) {
        const [sosSnap, volSnap] = await Promise.all([
          getDocs(collection(db, 'sos_requests')),
          getDocs(collection(db, 'volunteers')),
        ]);

        const sosData = sosSnap.docs.map((record) => ({ id: record.id, ...record.data() }));
        const volData = volSnap.docs.map((record) => ({ id: record.id, ...record.data() }));

        // Merge Firestore + localStorage, deduplicate by id
        const combined = [...sosData, ...local];
        const unique = combined.filter((item, idx, self) =>
          idx === self.findIndex(t => t.id === item.id)
        );
        setRequests(unique);
        setVolunteers(volData);
      } else {
        // No Firestore client available
        setRequests(local);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Dashboard load error:', err);
      const local = JSON.parse(localStorage.getItem('local_sos_requests') || '[]');
      setRequests(local);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    loadData();

    // Listen to local SOS writes (fired by offlineSync.transmitSOS)
    window.addEventListener('sos-updated', loadData);

    return () => window.removeEventListener('sos-updated', loadData);
  }, [isAuthed, loadData]);

  const handleAssign = async (reqId) => {
    if (db) await updateDoc(doc(db, 'sos_requests', reqId), { status: 'assigned' });
    setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'assigned' } : r));
  };

  const displayedRequests = filter === 'ALL' ? requests : requests.filter(r => r.priority === filter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const isHighRisk = pendingCount > 2;

  // Show loading while Firebase checks session (redirects to /login if no session)
  if (!isAuthed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--brand-primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem auto' }} />
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // ─── COMMAND CENTER ──────────────────────────────────────────────────────────
  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>

      {/* Top Bar */}
      <div className="flex items-center justify-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="flex items-center gap-3">
          <h1 style={{ fontSize: '1.625rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert color="var(--brand-danger)" size={26} /> Admin Command Center
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', background: db ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${db ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: '50px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: db ? 'var(--brand-success)' : 'var(--brand-warning)', boxShadow: db ? '0 0 6px var(--brand-success)' : 'none' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: db ? 'var(--brand-success)' : 'var(--brand-warning)' }}>
              {db ? 'FIREBASE LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadData} style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.4rem 0.75rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
            <RefreshCw size={13} /> {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Refresh'}
          </button>
          <div className="glass flex items-center" style={{ padding: '0.35rem', borderRadius: '10px' }}>
            {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? 'rgba(255,255,255,0.12)' : 'transparent', border: 'none', color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)', padding: '0.3rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}>
                {f}
              </button>
            ))}
          </div>
          <button onClick={handleLogout} title="Logout" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.45rem 0.75rem', color: 'var(--brand-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
            <LogOut size={13} /> Logout
          </button>
        </div>
      </div>

      {/* Heatmap Alert */}
      {isHighRisk && (
        <div className="glass animate-slide-up" style={{ padding: '0.875rem 1.5rem', marginBottom: '1.5rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)' }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={24} color="var(--brand-danger)" />
            <div>
              <p style={{ color: 'var(--brand-danger)', fontWeight: 800, margin: 0, fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '1px' }}>⚠ AI Heatmap Alert — High Risk Zone Detected</p>
              <p style={{ margin: '0.15rem 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{pendingCount} unassigned SOS signals clustered. Routing EMS dispersal automatically.</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {[
          { label: 'Total SOS', value: requests.length, color: 'var(--brand-primary)', shadow: 'rgba(59,130,246,0.2)' },
          { label: 'Pending', value: requests.filter(r => r.status === 'pending').length, color: 'var(--brand-danger)', shadow: 'rgba(239,68,68,0.2)' },
          { label: 'Assigned', value: requests.filter(r => r.status === 'assigned').length, color: 'var(--brand-warning)', shadow: 'rgba(245,158,11,0.2)' },
          { label: 'Resolved', value: requests.filter(r => r.status === 'resolved').length, color: 'var(--brand-success)', shadow: 'rgba(16,185,129,0.2)' },
        ].map((s, i) => (
          <div key={s.label} className={`glass animate-slide-up delay-${i+1}`} style={{ padding: '1.5rem', textAlign: 'center', borderBottom: `2px solid ${s.color}`, boxShadow: `0 8px 32px -4px ${s.shadow}` }}>
            <p style={{ fontSize: '2.5rem', fontWeight: 900, color: s.color, margin: 0, lineHeight: 1, textShadow: `0 0 20px ${s.shadow}` }}>{s.value}</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex" style={{ gap: '1.5rem', minHeight: '600px', flexWrap: 'wrap' }}>

        {/* SOS Feed */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '680px', overflowY: 'auto', paddingRight: '4px' }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass" style={{ padding: '1.25rem' }}>
                <div style={{ height: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', marginBottom: '0.6rem', width: '50%' }} />
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', width: '85%' }} />
              </div>
            ))
          ) : displayedRequests.length === 0 ? (
            <div className="glass" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <CheckCircle size={36} style={{ margin: '0 auto 1rem auto', color: 'var(--brand-success)', opacity: 0.4 }} />
              <p style={{ fontWeight: 600 }}>No SOS requests yet</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.4rem', opacity: 0.6 }}>Real-time updates will appear when victims send SOS.</p>
            </div>
          ) : displayedRequests.map(req => (
            <div key={req.id} className="glass" style={{ padding: '1.25rem', flexShrink: 0, borderLeft: `4px solid ${req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)'}` }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '5px', background: req.priority === 'HIGH' ? 'rgba(239,68,68,0.15)' : req.priority === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)', letterSpacing: '0.5px' }}>
                  {req.priority || 'UNKNOWN'}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  <Clock size={10} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                  {req.timestamp || (req.created_at ? new Date(req.created_at).toLocaleTimeString() : 'Just now')}
                </span>
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>{req.type || 'Emergency Signal'}</h3>
              
              {/* Extracted Rapido-Style Address */}
              {req.description?.includes('📍 Location:') && (
                <p style={{ fontSize: '0.8rem', color: 'white', fontWeight: 600, margin: '0.4rem 0', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MapPin size={14} color="var(--brand-primary)" />
                  {req.description.split('📍 Location:')[1].trim()}
                </p>
              )}
              
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.85rem', lineHeight: 1.4 }}>
                {req.description ? req.description.split('📍 Location:')[0].trim() : 'No additional description provided.'}
              </p>
              
              <div className="flex justify-between items-center">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPin size={11} color="var(--brand-primary)" />
                  {req.lat && req.lng ? `${parseFloat(req.lat).toFixed(4)}°, ${parseFloat(req.lng).toFixed(4)}°` : req.distance || 'No GPS'}
                </span>
                {req.status === 'pending' || !req.status ? (
                  <button onClick={() => handleAssign(req.id)} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.75rem' }}>Assign</button>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: req.status === 'resolved' ? 'var(--brand-success)' : 'var(--brand-warning)', fontWeight: 700 }}>
                    {req.status === 'resolved' ? '✓ Resolved' : '⏳ Assigned'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Map */}
        <div style={{ flex: '2 1 400px', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--glass-border)', minHeight: '500px' }}>
          <Map requests={displayedRequests} />
        </div>

        {/* Trust Score Sidebar */}
        <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <UserCheck size={14} color="var(--brand-primary)" /> Responder Trust Matrix
          </p>
          {volunteers.length === 0 ? (
            <div className="glass" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.7 }}>No volunteers registered yet.</div>
          ) : volunteers.map(vol => (
            <div key={vol.id} className="glass" style={{ padding: '1rem', borderLeft: `3px solid ${vol.trust_score >= 90 ? 'var(--brand-success)' : vol.trust_score >= 70 ? 'var(--brand-warning)' : 'var(--brand-danger)'}` }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{vol.name}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: vol.trust_score >= 90 ? 'var(--brand-success)' : vol.trust_score >= 70 ? 'var(--brand-warning)' : 'var(--brand-danger)' }}>{vol.trust_score}%</span>
              </div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{vol.skills || 'General'} · {vol.status}</p>
              <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px' }}>
                <div style={{ height: '100%', width: `${vol.trust_score}%`, background: vol.trust_score >= 90 ? 'var(--brand-success)' : vol.trust_score >= 70 ? 'var(--brand-warning)' : 'var(--brand-danger)', borderRadius: '2px', transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
