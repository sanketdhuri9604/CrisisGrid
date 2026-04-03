'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { QrCode, User, MapPin, CheckCircle, Shield, Navigation, AlertTriangle, UploadCloud, Activity, Globe, Clock, Bell } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../utils/firebaseClient';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';

// ─── Haversine Distance Calculator (km) ──────────────────────────────────────
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TASK_TIMEOUT_SECS = 20 * 60; // 20 minutes
const REMINDER_SECS = 15 * 60;     // 15 minutes

export default function VolunteerDashboard() {
  const [onboarded, setOnboarded] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [scanning, setScanning] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [requests, setRequests] = useState([]);
  const [regData, setRegData] = useState({ name: '', skills: '' });
  const [generatedQRValue, setGeneratedQRValue] = useState('');
  const [volunteerLog, setVolunteerLog] = useState({ assigned: 0, completed: 0 });
  const [volunteerLocation, setVolunteerLocation] = useState(null);

  // 20-min countdown timer
  const [timeLeft, setTimeLeft] = useState(null);
  const [reminderSent, setReminderSent] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const timerRef = useRef(null);
  const locationWatchRef = useRef(null);
  const fileInputRef = useRef(null);

  // ─── GPS: Watch volunteer position continuously ───────────────
  useEffect(() => {
    if (!onboarded) return;
    if (!navigator.geolocation) return;

    locationWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setVolunteerLocation(loc);
        // Sync to Firestore every position update
        if (db && regData.name) {
          setDoc(doc(db, 'volunteers', regData.name), {
            name: regData.name,
            lat: loc.lat,
            lng: loc.lng,
            status: activeTask ? 'On Mission' : 'Active',
            updated_at: new Date().toISOString(),
          }, { merge: true }).catch(() => {});
        }
      },
      () => {
        // Offline/denied fallback - use Mumbai default
        setVolunteerLocation({ lat: 19.0760, lng: 72.8777 });
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      if (locationWatchRef.current) navigator.geolocation.clearWatch(locationWatchRef.current);
    };
  }, [onboarded, regData.name, activeTask]);

  // ─── Load SOS requests from Firestore ─────────────────────────
  const loadRequests = useCallback(() => {
  if (!db) return;
  const q = query(collection(db, 'sos_requests'), where('status', '==', 'pending'));
  const unsub = onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setRequests(data);
  });
  return unsub;
}, []);

useEffect(() => {
  if (!onboarded) return;
  if (!navigator.geolocation) return;

  locationWatchRef.current = navigator.geolocation.watchPosition(
    async (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setVolunteerLocation(loc);
      if (db && regData.name) {
        await setDoc(doc(db, 'volunteers', regData.name), {
          name: regData.name,
          lat: loc.lat,
          lng: loc.lng,
          status: activeTask ? 'On Mission' : 'Active',
          updated_at: new Date().toISOString(),
        }, { merge: true });
      }
    },
    () => setVolunteerLocation({ lat: 19.0760, lng: 72.8777 }),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );

  return () => {
    if (locationWatchRef.current) 
      navigator.geolocation.clearWatch(locationWatchRef.current);
  };
}, [onboarded, regData.name, activeTask]);

  // ─── 20-min countdown + 15-min reminder ──────────────────────
  useEffect(() => {
    if (!activeTask) {
      clearInterval(timerRef.current);
      setTimeLeft(null);
      setReminderSent(false);
      setShowReminder(false);
      return;
    }
    setTimeLeft(TASK_TIMEOUT_SECS);
    setReminderSent(false);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        const next = prev - 1;
        // 15-min reminder
        if (next === TASK_TIMEOUT_SECS - REMINDER_SECS && !reminderSent) {
          setReminderSent(true);
          setShowReminder(true);
          setTimeout(() => setShowReminder(false), 8000);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [activeTask]);

  const formatTime = (secs) => {
    if (secs == null) return '--:--';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const timerColor = timeLeft == null ? 'var(--brand-primary)'
    : timeLeft < 60 ? 'var(--brand-danger)'
    : timeLeft < 300 ? 'var(--brand-warning)'
    : 'var(--brand-success)';

  // ─── Registration / QR ───────────────────────────────────────
  const handleRegister = async (e) => {
  e.preventDefault();
  const qrPayload = JSON.stringify({ ...regData, id: Date.now() });
  setGeneratedQRValue(qrPayload);
  localStorage.setItem('cached_qr_decryption', JSON.stringify(regData));

  if (db) {
    await setDoc(doc(db, 'volunteers', regData.name), {
      name: regData.name,
      skills: regData.skills,
      status: 'Active',
      trust_score: 100,
      updated_at: new Date().toISOString(),
    });
  }
  setAuthMode('show_qr');
};
  const handleQRUpload = (e) => {
    if (!e.target.files?.length) return;
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      try {
        const raw = localStorage.getItem('cached_qr_decryption');
        if (raw) setRegData(JSON.parse(raw));
      } catch (_) {}
      setOnboarded(true);
    }, 1200);
  };

  // ─── Task Actions ─────────────────────────────────────────────
  const updateTaskStatus = async (id, newStatus) => {
  if (db) {
    await updateDoc(doc(db, 'sos_requests', id), { status: newStatus });
  }
  const local = JSON.parse(localStorage.getItem('local_sos_requests') || '[]');
  localStorage.setItem('local_sos_requests', JSON.stringify(
    local.map(r => r.id === id ? { ...r, status: newStatus } : r)
  ));
  setRequests(prev => prev.filter(r => r.id !== id));
  window.dispatchEvent(new Event('sos-updated'));
};

  const syncTrustScore = async (name, completed, assigned) => {
  if (!db || !name) return;
  const score = assigned > 0 ? Math.round((completed / assigned) * 100) : 100;
  await setDoc(doc(db, 'volunteers', name), {
    trust_score: score,
    updated_at: new Date().toISOString(),
  }, { merge: true });
};

  const handleAssign = (req) => {
    setActiveTask(req);
    updateTaskStatus(req.id, 'assigned');
    setVolunteerLog(prev => ({ ...prev, assigned: prev.assigned + 1 }));
  };

  const handleResolve = () => {
    if (!activeTask) return;
    updateTaskStatus(activeTask.id, 'resolved');
    setActiveTask(null);
    setVolunteerLog(prev => {
      const next = { ...prev, completed: prev.completed + 1 };
      syncTrustScore(regData.name, next.completed, next.assigned);
      return next;
    });
  };

  const handleAbort = () => {
    if (!activeTask) return;
    updateTaskStatus(activeTask.id, 'pending');
    setActiveTask(null);
    setVolunteerLog(prev => {
      const next = { ...prev };
      syncTrustScore(regData.name, next.completed, next.assigned);
      return next;
    });
  };

  // ─── Nearest Task sorting ─────────────────────────────────────
  const pendingTasks = requests.map(req => ({
    ...req,
    _calcDist: (volunteerLocation && req.lat && req.lng)
      ? getDistanceKm(volunteerLocation.lat, volunteerLocation.lng, req.lat, req.lng)
      : 999,
  })).sort((a, b) => a._calcDist - b._calcDist);

  const aiSuggestedTask = pendingTasks.find(r => r.priority === 'HIGH') || pendingTasks[0];

  const trustScore = volunteerLog.assigned > 0
    ? Math.round((volunteerLog.completed / volunteerLog.assigned) * 100)
    : 100;
  const trustColor = trustScore >= 90 ? 'var(--brand-success)' : trustScore >= 70 ? 'var(--brand-warning)' : 'var(--brand-danger)';

  // ─── AUTH GATE ────────────────────────────────────────────────
  if (!onboarded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="glass shadow-lg animate-slide-up" style={{ padding: '3.5rem 3rem', maxWidth: '480px', width: '100%', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-60px', left: '-60px', width: '200px', height: '200px', background: 'rgba(59, 130, 246, 0.25)', filter: 'blur(70px)', borderRadius: '50%', pointerEvents: 'none' }} />

          {authMode === 'login' && (
            <>
              <div className="animate-pulse-glow" style={{ width: '88px', height: '88px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', border: '1px solid rgba(59,130,246,0.4)', boxShadow: 'inset 0 0 20px rgba(59,130,246,0.1)' }}>
                <QrCode size={40} color="var(--brand-primary)" />
              </div>
              <h2 style={{ fontSize: '2.25rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Field Agent Login</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', lineHeight: 1.6 }}>
                Upload your encrypted QR Badge for instant access.<br />No password required.
              </p>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleQRUpload} style={{ display: 'none' }} />
              <button 
                onClick={() => fileInputRef.current.click()} 
                disabled={scanning} 
                style={{ width: '100%', padding: '2rem', border: `2px dashed ${scanning ? 'var(--brand-success)' : 'rgba(59,130,246,0.6)'}`, borderRadius: '16px', background: scanning ? 'rgba(16,185,129,0.05)' : 'rgba(59,130,246,0.05)', color: scanning ? 'var(--brand-success)' : 'var(--brand-primary)', cursor: scanning ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', transition: 'all 0.3s', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)' }}
                className={!scanning ? "neon-border" : ""}
              >
                {scanning ? <CheckCircle size={36} /> : <UploadCloud size={36} />}
                <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.5px' }}>{scanning ? 'Decrypting Badge...' : 'Upload QR Badge'}</span>
              </button>
              <p style={{ marginTop: '2rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                First time?{' '}
                <button onClick={() => setAuthMode('register')} style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontWeight: 700 }}>Generate your QR Badge →</button>
              </p>
            </>
          )}

          {authMode === 'register' && (
            <>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Register as Volunteer</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Your credentials will be encoded into an encrypted QR badge.</p>
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Full Name</label>
                  <input required value={regData.name} onChange={e => setRegData({ ...regData, name: e.target.value })} type="text" placeholder="e.g. Rahul Sharma" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Specialized Skills</label>
                  <select required value={regData.skills} onChange={e => setRegData({ ...regData, skills: e.target.value })} style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: regData.skills ? 'white' : 'rgba(255,255,255,0.4)', outline: 'none', appearance: 'none' }}>
                    <option value="" disabled>Select Primary Skillset</option>
                    <option value="Medical / EMT">🏥 Medical / EMT</option>
                    <option value="Search & Rescue">🔦 Search & Rescue</option>
                    <option value="Transport / Driver">🚗 Transport / Driver</option>
                    <option value="Supply Logistics">📦 Supply Logistics</option>
                    <option value="Fire & Hazard Control">🔥 Fire & Hazard Control</option>
                    <option value="General Support">🤝 General Support</option>
                  </select>
                </div>
                <button type="submit" style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'linear-gradient(135deg, var(--brand-primary), #1d4ed8)', border: 'none', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                  Generate Encrypted QR Badge
                </button>
                <button type="button" onClick={() => setAuthMode('login')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  ← Back to Login
                </button>
              </form>
            </>
          )}

          {authMode === 'show_qr' && (
            <>
              <div style={{ width: '64px', height: '64px', background: 'rgba(16,185,129,0.1)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', border: '1px solid rgba(16,185,129,0.3)' }}>
                <CheckCircle size={32} color="var(--brand-success)" />
              </div>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--brand-success)' }}>Badge Ready!</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                Save this QR code as a screenshot. Upload it next time to log in instantly.
              </p>
              <div style={{ background: 'white', padding: '1.25rem', display: 'inline-block', borderRadius: '16px', marginBottom: '2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <QRCodeSVG value={generatedQRValue} size={180} level="H" />
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Name: <strong style={{ color: 'white' }}>{regData.name}</strong> · Skills: <strong style={{ color: 'white' }}>{regData.skills}</strong>
              </p>
              <button onClick={() => setAuthMode('login')} style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'linear-gradient(135deg, var(--brand-success), #059669)', border: 'none', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
                I've saved it — Go to Login
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── VOLUNTEER DASHBOARD ──────────────────────────────────────
  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>

      {/* 15-min Reminder Banner */}
      {showReminder && (
        <div className="animate-slide-up" style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, padding: '1rem 2rem', background: 'rgba(245, 158, 11, 0.95)', borderRadius: '12px', border: '1px solid var(--brand-warning)', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }}>
          <Bell size={20} color="white" />
          <span style={{ fontWeight: 700, color: 'white' }}>⏰ 15 minutes elapsed — Has the mission been completed?</span>
        </div>
      )}

      {/* Volunteer Header */}
      <div className="glass" style={{ padding: '1.25rem 1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: `2px solid ${trustColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
            <User size={24} color={trustColor} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{regData.name || 'Field Agent'}</h1>
            <div className="flex items-center gap-2">
              <Shield size={12} color={trustColor} />
              <span style={{ fontSize: '0.8rem', color: trustColor, fontWeight: 600 }}>
                Trust Score: {trustScore}% · {volunteerLog.completed}/{volunteerLog.assigned} Missions
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {volunteerLocation && (
            <div className="animate-pulse-glow" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.875rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '50px' }}>
              <MapPin size={14} color="var(--brand-success)" />
              <span style={{ fontSize: '0.75rem', color: 'var(--brand-success)', fontWeight: 800 }}>GPS Live: {volunteerLocation.lat.toFixed(4)}°, {volunteerLocation.lng.toFixed(4)}°</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.875rem', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '50px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--brand-primary)', boxShadow: '0 0 8px var(--brand-primary)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-primary)', fontWeight: 800 }}>Online</span>
          </div>
        </div>
      </div>

      <div className="flex" style={{ gap: '1.5rem', flexWrap: 'wrap' }}>

        {/* Task Board */}
        <div style={{ flex: '1 1 480px' }}>

          {/* AI Suggestion */}
          {aiSuggestedTask && !activeTask && (
            <div className="glass shadow-lg animate-slide-up neon-border" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'rgba(59,130,246,0.1)' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: '1.25rem' }}>
                <div style={{ position: 'relative' }}>
                  <Activity size={20} color="var(--brand-primary)" />
                  <div style={{ position: 'absolute', inset: -4, border: '1px solid var(--brand-primary)', borderRadius: '50%', animation: 'radarSweep 2s linear infinite' }} />
                </div>
                <span style={{ fontWeight: 900, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.85rem' }}>Dynamic Routing AI — Nearest Emergency</span>
              </div>
              <div style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', borderLeft: `4px solid ${aiSuggestedTask.priority === 'HIGH' ? 'var(--brand-danger)' : 'var(--brand-success)'}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                <div className="flex justify-between items-center">
                  <h3 style={{ fontWeight: 800, margin: 0, fontSize: '1.1rem' }}>{aiSuggestedTask.type}</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--brand-primary)', fontWeight: 800 }}>
                    {aiSuggestedTask._calcDist < 999 ? `${aiSuggestedTask._calcDist.toFixed(1)} km away` : ''}
                  </span>
                </div>
                
                {/* Extracted Rapido-Style Address */}
                {aiSuggestedTask.description?.includes('📍 Location:') && (
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem 1rem', borderRadius: '8px', marginTop: '1rem', borderLeft: '2px solid var(--brand-primary)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <MapPin size={18} color="var(--brand-primary)" style={{ marginTop: '2px' }} />
                    <div>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Target Destination</span>
                      <strong style={{ fontSize: '0.9rem', color: 'white' }}>{aiSuggestedTask.description.split('📍 Location:')[1].trim()}</strong>
                    </div>
                  </div>
                )}
                
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.75rem 0 1.25rem', lineHeight: 1.5 }}>
                  {aiSuggestedTask.description?.split('📍 Location:')[0].trim()}
                </p>
                <button onClick={() => handleAssign(aiSuggestedTask)} className="btn btn-primary" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 8px 24px -6px rgba(239,68,68,0.5)' }}>
                  <Navigation size={18} /> Accept Target ({aiSuggestedTask._calcDist < 999 ? `${aiSuggestedTask._calcDist.toFixed(1)} km` : 'Unknown'})
                </button>
              </div>
            </div>
          )}

          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <MapPin size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
            All Nearby Tasks ({pendingTasks.length})
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingTasks
              .slice()
              .sort((a, b) => {
                const pMap = { HIGH: 3, MEDIUM: 2, LOW: 1 };
                const pA = pMap[a.priority] || 0;
                const pB = pMap[b.priority] || 0;
                if (pA !== pB) return pB - pA;
                return (a._calcDist || 999) - (b._calcDist || 999);
              })
              .map((req, i) => (
              <div key={req.id} className="glass animate-slide-up" style={{ padding: '1.25rem', flexShrink: 0, animationDelay: `${i * 0.05}s`, borderLeft: `4px solid ${req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)'}`, opacity: activeTask ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                <div className="flex justify-between items-center" style={{ marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '6px', background: req.priority === 'HIGH' ? 'rgba(239,68,68,0.15)' : req.priority === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)' }}>{req.priority || 'UNKNOWN'}</span>
                  {req._calcDist < 999 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--brand-primary)', fontWeight: 600 }}>📍 {req._calcDist.toFixed(1)} km</span>
                  )}
                </div>
                <h3 style={{ fontWeight: 700, marginBottom: '0.25rem', fontSize: '1rem' }}>{req.type || 'Emergency Signal'}</h3>
                
                {req.description?.includes('📍 Location:') && (
                  <p style={{ fontSize: '0.8rem', color: 'white', fontWeight: 600, margin: '0.5rem 0', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MapPin size={14} color="var(--brand-primary)" />
                    {req.description.split('📍 Location:')[1].trim()}
                  </p>
                )}
                
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                  {req.description ? req.description.split('📍 Location:')[0].trim() : 'No additional description payload provided.'}
                </p>
                <button onClick={() => handleAssign(req)} disabled={activeTask !== null} className="btn btn-secondary" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', cursor: activeTask ? 'not-allowed' : 'pointer', fontSize: '0.875rem' }}>
                  {activeTask ? 'Mission in Progress...' : 'Accept Mission'}
                </button>
              </div>
            ))}
            {pendingTasks.length === 0 && (
              <div className="glass" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <CheckCircle size={40} style={{ margin: '0 auto 1rem auto', color: 'var(--brand-success)', opacity: 0.5 }} />
                <p style={{ fontWeight: 600 }}>No pending tasks</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.7 }}>Standby mode — tasks will appear when SOS is sent.</p>
              </div>
            )}
          </div>
        </div>

        {/* Active Mission Panel */}
        <div style={{ flex: '1 1 320px' }}>
          {activeTask ? (
            <div className="glass" style={{ padding: '2rem', border: '1px solid var(--brand-primary)', boxShadow: '0 0 40px rgba(59,130,246,0.15)', position: 'sticky', top: '90px' }}>

              {/* Countdown timer */}
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Mission Timer</p>
                <div style={{ fontSize: '3.5rem', fontWeight: 900, color: timerColor, fontFamily: 'monospace', lineHeight: 1, transition: 'color 0.5s' }}>
                  {formatTime(timeLeft)}
                </div>
                {timeLeft === 0 && (
                  <p style={{ color: 'var(--brand-danger)', fontWeight: 700, marginTop: '0.5rem', fontSize: '0.875rem' }}>⚠ Time limit reached!</p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <Navigation size={24} color="var(--brand-primary)" />
              </div>
              <h3 style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Mission Active</h3>
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                {activeTask.type} · {activeTask._calcDist < 999 ? `${activeTask._calcDist?.toFixed(1)} km away` : 'Navigating...'}
              </p>

              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
                {/* Extracted Address */}
                {activeTask.description?.includes('📍 Location:') && (
                  <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--brand-primary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '0.25rem', textAlign: 'center' }}>Target Destination</p>
                    <p style={{ fontSize: '0.95rem', color: 'white', fontWeight: 600, textAlign: 'center' }}>
                      <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: '0.2rem' }} color="var(--brand-danger)" />
                      {activeTask.description.split('📍 Location:')[1].trim()}
                    </p>
                  </div>
                )}
                
                <p style={{ fontSize: '0.875rem', fontStyle: 'italic', color: 'var(--brand-warning)', lineHeight: 1.5, textAlign: 'center' }}>
                  "{activeTask.description?.split('📍 Location:')[0].trim()}"
                </p>
                {activeTask.lat && activeTask.lng && (
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.75rem', textAlign: 'center' }}>
                    GPS: {parseFloat(activeTask.lat).toFixed(5)}°, {parseFloat(activeTask.lng).toFixed(5)}°
                  </p>
                )}
              </div>

              {/* Google Maps Navigation */}
              {activeTask.lat && activeTask.lng && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${activeTask.lat},${activeTask.lng}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '0.875rem', borderRadius: '10px', background: '#4285F4', color: 'white', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', marginBottom: '0.75rem' }}
                >
                  <Globe size={18} /> Open in Google Maps
                </a>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button onClick={handleResolve} style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', background: 'linear-gradient(135deg, var(--brand-success), #059669)', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                  <CheckCircle size={18} /> Mark as Completed ↑ Trust
                </button>
                <button onClick={handleAbort} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--brand-danger)', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
                  Abort Mission ↓ Trust Score
                </button>
              </div>
            </div>
          ) : (
            <div className="glass" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', position: 'sticky', top: '90px' }}>
              <AlertTriangle size={40} style={{ margin: '0 auto 1rem auto', opacity: 0.4 }} />
              <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Standby Mode</h3>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>Accept a mission from the task board.<br />AI will recommend the nearest emergency.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
