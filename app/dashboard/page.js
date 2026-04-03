'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Clock, MapPin, CheckCircle, AlertTriangle, UserCheck, LogOut, Phone, Eye } from 'lucide-react';
import { auth, db } from '../utils/firebaseClient';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const Map = dynamic(() => import('../components/Map'), { ssr: false, loading: () => <div className="glass" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading Map Engine...</div> });

export default function Dashboard() {
  const router = useRouter();
  const [filter, setFilter] = useState('ALL');
  const [requests, setRequests] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [isAuthed, setIsAuthed] = useState(() => !auth);
  const [loading, setLoading] = useState(() => !!auth && !!db);
  const [lastUpdated, setLastUpdated] = useState(null);
  const unsubRefs = useRef([]);

  // ─── Auth Gate — sirf admin ───────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return; }
      if (db) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (!snap.exists() || snap.data().role !== 'admin') {
            await signOut(auth);
            router.push('/login');
            return;
          }
        } catch (e) {
          await signOut(auth);
          router.push('/login');
          return;
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

  // ─── Real-Time Listeners ──────────────────────────────────────
  useEffect(() => {
    if (!isAuthed || !db) return;

    const sosUnsub = onSnapshot(collection(db, 'sos_requests'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Newest first
      data.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
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

  // ─── Filter logic ─────────────────────────────────────────────
  const displayedRequests = filter === 'ALL'
    ? requests
    : filter === 'PENDING' || filter === 'ACCEPTED' || filter === 'RESOLVED'
    ? requests.filter(r => r.status?.toUpperCase() === filter)
    : requests.filter(r => r.priority === filter);

  const pendingCount  = requests.filter(r => r.status === 'pending').length;
  const acceptedCount = requests.filter(r => r.status === 'accepted').length;
  const isHighRisk    = pendingCount > 2;

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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--brand-primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem auto' }} />
          <p>Verifying authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>

      {/* Top Bar */}
      <div className="flex items-center justify-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="flex items-center gap-3">
          <h1 style={{ fontSize: '1.625rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert color="var(--brand-danger)" size={26} /> Admin Command Center
          </h1>
          {/* Read Only badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '50px' }}>
            <Eye size={12} color="#a78bfa" />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a78bfa' }}>VIEW ONLY</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', background: db ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${db ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: '50px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: db ? 'var(--brand-success)' : 'var(--brand-warning)', animation: db ? 'pulseGlow 2s infinite' : 'none' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: db ? 'var(--brand-success)' : 'var(--brand-warning)' }}>
              {db ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Connecting...'}
          </span>
          {/* Status filter tabs */}
          <div className="glass flex items-center" style={{ padding: '0.35rem', borderRadius: '10px' }}>
            {['ALL', 'HIGH', 'MEDIUM', 'PENDING', 'ACCEPTED', 'RESOLVED'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? 'rgba(255,255,255,0.12)' : 'transparent', border: 'none', color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)', padding: '0.3rem 0.65rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.72rem' }}>
                {f}
              </button>
            ))}
          </div>
          <button onClick={handleLogout} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.45rem 0.75rem', color: 'var(--brand-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
            <LogOut size={13} /> Logout
          </button>
        </div>
      </div>

      {/* High Risk Alert */}
      {isHighRisk && (
        <div className="glass animate-slide-up" style={{ padding: '0.875rem 1.5rem', marginBottom: '1.5rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)' }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={24} color="var(--brand-danger)" />
            <div>
              <p style={{ color: 'var(--brand-danger)', fontWeight: 800, margin: 0, fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '1px' }}>⚠ High Risk — {pendingCount} SOS Awaiting Volunteer</p>
              <p style={{ margin: '0.15rem 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Volunteers have not accepted these requests yet.</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {[
          { label: 'Total SOS', value: requests.length, color: 'var(--brand-primary)', shadow: 'rgba(59,130,246,0.2)' },
          { label: 'Pending', value: pendingCount, color: 'var(--brand-danger)', shadow: 'rgba(239,68,68,0.2)' },
          { label: 'Accepted', value: acceptedCount, color: 'var(--brand-warning)', shadow: 'rgba(245,158,11,0.2)' },
          { label: 'Resolved', value: requests.filter(r => r.status === 'resolved').length, color: 'var(--brand-success)', shadow: 'rgba(16,185,129,0.2)' },
          { label: 'Volunteers', value: volunteers.length, color: '#a78bfa', shadow: 'rgba(139,92,246,0.2)' },
        ].map((s, i) => (
          <div key={s.label} className={`glass animate-slide-up delay-${i+1}`} style={{ padding: '1.5rem', textAlign: 'center', borderBottom: `2px solid ${s.color}`, boxShadow: `0 8px 32px -4px ${s.shadow}` }}>
            <p style={{ fontSize: '2.5rem', fontWeight: 900, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex" style={{ gap: '1.5rem', minHeight: '600px', flexWrap: 'wrap' }}>

        {/* SOS Feed — READ ONLY */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '700px', overflowY: 'auto', paddingRight: '4px' }}>
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
              <p style={{ fontWeight: 600 }}>No requests in this filter</p>
            </div>
          ) : displayedRequests.map(req => (
            <div key={req.id} className="glass" style={{ padding: '1.25rem', flexShrink: 0, borderLeft: `4px solid ${req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)'}` }}>

              {/* Priority + Time */}
              <div className="flex justify-between items-center" style={{ marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '5px', background: req.priority === 'HIGH' ? 'rgba(239,68,68,0.15)' : req.priority === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)' }}>
                  {req.priority || 'UNKNOWN'}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  <Clock size={10} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                  {req.created_at ? new Date(req.created_at).toLocaleTimeString() : 'Just now'}
                </span>
              </div>

              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>{req.type || 'Emergency Signal'}</h3>

              {req.phone && (
                <p style={{ fontSize: '0.8rem', color: 'var(--brand-warning)', margin: '0.3rem 0', fontWeight: 600 }}>📞 {req.phone}</p>
              )}

              {req.description?.includes('📍 Location:') && (
                <p style={{ fontSize: '0.8rem', color: 'white', fontWeight: 600, margin: '0.4rem 0', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MapPin size={14} color="var(--brand-primary)" />
                  {req.description.split('📍 Location:')[1].trim()}
                </p>
              )}

              {req.notes && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0.3rem 0' }}>&quot;{req.notes}&quot;</p>
              )}

              {/* ✅ Assigned Volunteer Info — admin sirf dekhe */}
              {req.status === 'accepted' && req.assigned_volunteer && (
                <div style={{ margin: '0.75rem 0', padding: '0.75rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--brand-warning)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 0.4rem' }}>
                    Volunteer Accepted
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 700 }}>
                      👤 {req.assigned_volunteer.name}
                    </span>
                    {req.assigned_volunteer.phone && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--brand-success)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Phone size={11} /> {req.assigned_volunteer.phone}
                      </span>
                    )}
                  </div>
                  {req.assigned_volunteer.skills && (
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                      🛠 {Array.isArray(req.assigned_volunteer.skills) ? req.assigned_volunteer.skills.join(', ') : req.assigned_volunteer.skills}
                    </p>
                  )}
                  {req.accepted_at && (
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                      ⏱ Accepted at {new Date(req.accepted_at).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              )}

              {/* Status + GPS — NO action buttons for admin */}
              <div className="flex justify-between items-center" style={{ marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPin size={11} color="var(--brand-primary)" />
                  {req.lat && req.lng ? `${parseFloat(req.lat).toFixed(4)}°, ${parseFloat(req.lng).toFixed(4)}°` : 'No GPS'}
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: statusColor(req.status), padding: '0.2rem 0.5rem', background: `${statusColor(req.status)}18`, borderRadius: '6px', border: `1px solid ${statusColor(req.status)}40` }}>
                  {statusLabel(req.status)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Map */}
        <div style={{ flex: '2 1 400px', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--glass-border)', minHeight: '500px' }}>
          <Map requests={displayedRequests} />
        </div>

        {/* Volunteer Trust Sidebar */}
        <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <UserCheck size={14} color="var(--brand-primary)" /> Volunteer Status
          </p>
          {volunteers.length === 0 ? (
            <div className="glass" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.7 }}>No volunteers registered.</div>
          ) : volunteers.map(vol => {
            const onMission = requests.find(r => r.assigned_volunteer?.id === vol.id && r.status === 'accepted');
            return (
              <div key={vol.id} className="glass" style={{ padding: '1rem', borderLeft: `3px solid ${vol.trust_score >= 90 ? 'var(--brand-success)' : vol.trust_score >= 70 ? 'var(--brand-warning)' : 'var(--brand-danger)'}` }}>
                <div className="flex justify-between items-center" style={{ marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{vol.name}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: vol.trust_score >= 90 ? 'var(--brand-success)' : vol.trust_score >= 70 ? 'var(--brand-warning)' : 'var(--brand-danger)' }}>{vol.trust_score ?? 100}%</span>
                </div>
                <p style={{ margin: '0 0 0.3rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  {Array.isArray(vol.skills) ? vol.skills.join(', ') : vol.skills || 'General'}
                </p>
                {/* ✅ Mission status */}
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.68rem', fontWeight: 700, color: onMission ? 'var(--brand-warning)' : 'var(--brand-success)' }}>
                  {onMission ? `⏳ On Mission: ${onMission.type}` : '✓ Available'}
                </p>
                <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px' }}>
                  <div style={{ height: '100%', width: `${vol.trust_score ?? 100}%`, background: vol.trust_score >= 90 ? 'var(--brand-success)' : vol.trust_score >= 70 ? 'var(--brand-warning)' : 'var(--brand-danger)', borderRadius: '2px', transition: 'width 0.6s ease' }} />
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}