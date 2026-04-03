'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { User, MapPin, CheckCircle, Shield, Navigation, AlertTriangle, Activity, Globe, Clock, Bell, LogOut } from 'lucide-react';
import { auth, db } from '../utils/firebaseClient';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { useRouter } from 'next/navigation';

// ─── Haversine Distance Calculator (km) ──────────────────────────────────────
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TASK_TIMEOUT_SECS = 20 * 60;
const REMINDER_SECS = 15 * 60;

// 🔐 Secret passwords — sirf tujhe pata hain!
const ROLE_PASSWORDS = {
  'admin': 'ADMIN@2024',
  'pharmacy': 'PHARMA@2024',
};

export default function VolunteerDashboard() {
  const router = useRouter();
  const [onboarded, setOnboarded] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [loadingCode, setLoadingCode] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [requests, setRequests] = useState([]);
  const [uid, setUid] = useState('');
  const [regData, setRegData] = useState({ email: '', password: '', name: '', skills: [], experience_level: 'Intermediate' });
  const [volunteerLog, setVolunteerLog] = useState({ assigned: 0, completed: 0 });
  const [volunteerLocation, setVolunteerLocation] = useState(null);

  // ─── Role Selection States ────────────────────────────────────────
  const [selectedRole, setSelectedRole] = useState('volunteer');
  const [rolePassword, setRolePassword] = useState('');

  const [timeLeft, setTimeLeft] = useState(null);
  const [reminderSent, setReminderSent] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const timerRef = useRef(null);
  const reminderSentRef = useRef(false);
  const locationWatchRef = useRef(null);

  // ─── Auth State Listener ──────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setOnboarded(false);
        setUid('');
        setRegData({ email: '', password: '', name: '', skills: [], experience_level: 'Intermediate' });
        return;
      }

      if (db) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            const role = snap.data().role;
            // Admin ya pharmacy hai toh unke page pe redirect karo
            if (role === 'admin') {
              router.push('/dashboard');
              return;
            }
            if (role === 'pharmacy') {
              router.push('/pharmacy');
              return;
            }
            // Volunteer nahi hai toh sign out karo
            if (role !== 'volunteer') {
              await signOut(auth);
              return;
            }
          }
        } catch (e) {
          console.error('Role check failed:', e);
        }
      }

      if (db) {
        try {
          const docSnap = await getDoc(doc(db, 'volunteers', user.uid));
          const email = user.email || '';

          if (docSnap.exists()) {
            const d = docSnap.data();
            setRegData(prev => ({ ...prev, name: d.name || '', skills: d.skills || [], experience_level: d.experience_level || 'Intermediate', email }));
          } else {
            setRegData(prev => ({ ...prev, email }));
          }

          setUid(user.uid);
        } catch (err) {
          console.error('Profile load error:', err);
        }
      }

      setOnboarded(true);
    });
    return () => unsub();
  }, [router]);

  // ─── GPS: Watch volunteer position ───────────────────────────────
  useEffect(() => {
    if (!onboarded || !navigator.geolocation) return;

    locationWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setVolunteerLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setVolunteerLocation({ lat: 19.0760, lng: 72.8777 }),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      if (locationWatchRef.current) navigator.geolocation.clearWatch(locationWatchRef.current);
    };
  }, [onboarded]);

  // ─── Sync GPS to Firestore ────────────────────────────────────────
  useEffect(() => {
    if (!db || !uid || !volunteerLocation) return;
    setDoc(doc(db, 'volunteers', uid), {
      lat: volunteerLocation.lat,
      lng: volunteerLocation.lng,
      status: activeTask ? 'On Mission' : 'Active',
      updated_at: new Date().toISOString(),
    }, { merge: true }).catch(() => {});
  }, [volunteerLocation, uid, activeTask]);

  // ─── Load SOS requests in real-time ──────────────────────────────
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
    const unsub = loadRequests();
    return () => { if (unsub) unsub(); };
  }, [onboarded, loadRequests]);

  // ─── 20-min countdown + 15-min reminder ──────────────────────────
  useEffect(() => {
    if (!activeTask) {
      clearInterval(timerRef.current);
      setTimeLeft(null);
      setReminderSent(false);
      reminderSentRef.current = false;
      setShowReminder(false);
      return;
    }
    setTimeLeft(TASK_TIMEOUT_SECS);
    setReminderSent(false);
    reminderSentRef.current = false;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        const next = prev - 1;
        if (next === TASK_TIMEOUT_SECS - REMINDER_SECS && !reminderSentRef.current) {
          reminderSentRef.current = true;
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

  // ─── Registration / Login ─────────────────────────────────────────
  const handleAuth = async (e) => {
    e.preventDefault();
    if (!auth) { alert('Offline Mode. Auth disabled.'); return; }
    setLoadingCode(true);
    try {
      await setPersistence(auth, browserSessionPersistence);

      if (authMode === 'register') {
        // 🔐 Role password check — Admin/Pharmacy ke liye
        if (selectedRole !== 'volunteer') {
          if (!rolePassword || rolePassword !== ROLE_PASSWORDS[selectedRole]) {
            alert(`❌ Invalid authorization password for ${selectedRole} role!\nContact administrator.`);
            setLoadingCode(false);
            return;
          }
        }

        const userCred = await createUserWithEmailAndPassword(auth, regData.email, regData.password);

        if (db) {
          try {
            // Volunteers collection — sirf volunteer ke liye
            if (selectedRole === 'volunteer') {
              await setDoc(doc(db, 'volunteers', userCred.user.uid), {
                name: regData.name,
                email: regData.email,
                skills: regData.skills.length > 0 ? regData.skills : ['General Support'],
                experience_level: regData.experience_level,
                status: 'Active',
                trust_score: 100,
                updated_at: new Date().toISOString(),
              });
            }

            // ✅ Users collection — sabke liye role set karo
            await setDoc(doc(db, 'users', userCred.user.uid), {
              role: selectedRole,
              email: regData.email,
              name: regData.name,
            });

            alert(`✅ Registration successful!\nYou are registered as: ${selectedRole.toUpperCase()}`);
          } catch (error) {
            console.error('Firestore Error on Registration:', error);
            alert('Auth created, but failed to setup profile. Contact admin.');
          }
        }
      } else {
        await signInWithEmailAndPassword(auth, regData.email, regData.password);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingCode(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!auth) return;
    try {
      await sendPasswordResetEmail(auth, regData.email);
      alert('Password reset email sent!');
      setAuthMode('login');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = async () => {
    if (auth) await signOut(auth);
    setRequests([]);
  };

  // ─── Task Actions ─────────────────────────────────────────────────
  const updateTaskStatus = async (id, newStatus) => {
    if (db) await updateDoc(doc(db, 'sos_requests', id), { status: newStatus });
    const local = JSON.parse(localStorage.getItem('local_sos_requests') || '[]');
    localStorage.setItem('local_sos_requests', JSON.stringify(
      local.map(r => r.id === id ? { ...r, status: newStatus } : r)
    ));
    setRequests(prev => prev.filter(r => r.id !== id));
    window.dispatchEvent(new Event('sos-updated'));
  };

  const syncTrustScore = async (currentUid, completed, assigned) => {
    if (!db || !currentUid) return;
    const score = assigned > 0 ? Math.round((completed / assigned) * 100) : 100;
    await setDoc(doc(db, 'volunteers', currentUid), {
      trust_score: score,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  };

  const handleAssign = async (req) => {
    setActiveTask(req);
    if (db) {
      await updateDoc(doc(db, 'sos_requests', req.id), {
        status: 'assigned',
        assigned_volunteer: {
          name: regData.name || 'Emergency Responder',
          skills: regData.skills || [],
          location: volunteerLocation || null
        }
      });
    }
    const local = JSON.parse(localStorage.getItem('local_sos_requests') || '[]');
    localStorage.setItem('local_sos_requests', JSON.stringify(
      local.map(r => r.id === req.id ? { ...r, status: 'assigned' } : r)
    ));
    setRequests(prev => prev.filter(r => r.id !== req.id));
    window.dispatchEvent(new Event('sos-updated'));
    setVolunteerLog(prev => ({ ...prev, assigned: prev.assigned + 1 }));
  };

  const handleResolve = () => {
    if (!activeTask) return;
    updateTaskStatus(activeTask.id, 'resolved');
    setActiveTask(null);
    setVolunteerLog(prev => {
      const next = { ...prev, completed: prev.completed + 1 };
      syncTrustScore(uid, next.completed, next.assigned);
      return next;
    });
  };

  const handleAbort = () => {
    if (!activeTask) return;
    updateTaskStatus(activeTask.id, 'pending');
    setActiveTask(null);
    setVolunteerLog(prev => {
      const next = { ...prev };
      syncTrustScore(uid, next.completed, next.assigned);
      return next;
    });
  };

  // ─── AI Composite Algorithmic Assignment ──────────────────────────
  const pendingTasks = requests.map(req => {
    const dist = (volunteerLocation && req.lat && req.lng) ? getDistanceKm(volunteerLocation.lat, volunteerLocation.lng, req.lat, req.lng) : 999;
    let matchScore = 0;
    if (req.priority === 'HIGH' || req?.analysis?.severity === 'critical') matchScore += 1000;
    else if (req.priority === 'MEDIUM' || req?.analysis?.severity === 'high') matchScore += 500;
    else matchScore += 100;
    matchScore -= Math.min(dist * 10, 500);
    let skillOverlap = 0;
    if (req.analysis && req.analysis.suggested_specializations && regData.skills.length > 0) {
      req.analysis.suggested_specializations.forEach(aiSkill => {
        if (regData.skills.includes(aiSkill)) { skillOverlap++; matchScore += 300; }
      });
    } else {
      if (regData.skills.includes(req.type)) { skillOverlap++; matchScore += 300; }
    }
    if (req.trustScore > 80) matchScore += 50;
    return { ...req, _calcDist: dist, _matchScore: matchScore, _skillOverlap: skillOverlap };
  }).sort((a, b) => b._matchScore - a._matchScore);

  const aiSuggestedTask = pendingTasks[0];
  const trustScore = volunteerLog.assigned > 0 ? Math.round((volunteerLog.completed / volunteerLog.assigned) * 100) : 100;
  const trustColor = trustScore >= 90 ? 'var(--brand-success)' : trustScore >= 70 ? 'var(--brand-warning)' : 'var(--brand-danger)';

  // ─── AUTH GATE ────────────────────────────────────────────────────
  if (!onboarded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="glass shadow-lg animate-slide-up" style={{ padding: '3.5rem 3rem', maxWidth: '480px', width: '100%', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-60px', left: '-60px', width: '200px', height: '200px', background: 'rgba(59, 130, 246, 0.25)', filter: 'blur(70px)', borderRadius: '50%', pointerEvents: 'none' }} />

          {authMode === 'login' && (
            <>
              <h2 style={{ fontSize: '2.25rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Field Agent Login</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', lineHeight: 1.6 }}>Authenticate securely to access missions.</p>

              <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Email</label>
                  <input required value={regData.email} onChange={e => setRegData({ ...regData, email: e.target.value })} type="email" placeholder="agent@crisisgrid.com" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Password</label>
                  <input required value={regData.password} onChange={e => setRegData({ ...regData, password: e.target.value })} type="password" placeholder="••••••••" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>
                <button type="submit" disabled={loadingCode} style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'linear-gradient(135deg, var(--brand-primary), #1d4ed8)', border: 'none', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: loadingCode ? 'wait' : 'pointer', marginTop: '0.5rem' }}>
                  {loadingCode ? 'Authenticating...' : 'Login'}
                </button>
              </form>

              <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                <button onClick={() => setAuthMode('forgot')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem' }}>Forgot password?</button>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  New user? <button onClick={() => setAuthMode('register')} style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontWeight: 700 }}>Register Here →</button>
                </p>
              </div>
            </>
          )}

          {authMode === 'register' && (
            <>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1.5rem' }}>Create Account</h2>
              <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>

                {/* ─── Role Selection ─────────────────────────────── */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Register As</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {[
                      { value: 'volunteer', label: '🙋 Volunteer', desc: 'Help in field operations' },
                      { value: 'admin', label: '🛡️ Admin', desc: 'Command center access' },
                      { value: 'pharmacy', label: '💊 Pharmacy / NGO', desc: 'Manage supplies & inventory' },
                    ].map(opt => (
                      <label key={opt.value} onClick={() => { setSelectedRole(opt.value); setRolePassword(''); }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem', borderRadius: '10px', border: `1px solid ${selectedRole === opt.value ? 'var(--brand-primary)' : 'rgba(255,255,255,0.1)'}`, background: selectedRole === opt.value ? 'rgba(59,130,246,0.1)' : 'rgba(0,0,0,0.2)', cursor: 'pointer', transition: 'all 0.2s' }}>
                        <input type="radio" name="role" value={opt.value} checked={selectedRole === opt.value} onChange={() => { setSelectedRole(opt.value); setRolePassword(''); }} style={{ accentColor: 'var(--brand-primary)' }} />
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>{opt.label}</p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 🔐 Role Password — sirf Admin/Pharmacy ke liye */}
                {selectedRole !== 'volunteer' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.875rem', color: 'var(--brand-warning)' }}>
                      🔒 Authorization Password
                    </label>
                    <input
                      required
                      value={rolePassword}
                      onChange={e => setRolePassword(e.target.value)}
                      type="password"
                      placeholder={`Enter ${selectedRole} authorization password`}
                      style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.05)', color: 'white', outline: 'none' }}
                    />
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--brand-warning)' }}>
                      ⚠ Only authorized personnel can register as {selectedRole}
                    </p>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Full Name</label>
                  <input required value={regData.name} onChange={e => setRegData({ ...regData, name: e.target.value })} type="text" placeholder="e.g. Rahul Sharma" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Email</label>
                  <input required value={regData.email} onChange={e => setRegData({ ...regData, email: e.target.value })} type="email" placeholder="agent@crisisgrid.com" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Password</label>
                  <input required value={regData.password} onChange={e => setRegData({ ...regData, password: e.target.value })} type="password" placeholder="••••••••" minLength="6" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>

                {/* Skills — sirf volunteer ke liye */}
                {selectedRole === 'volunteer' && (
                  <>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Specialized Skills (Select multiple)</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {['Medical', 'Food', 'Rescue', 'Shelter', 'Medicine', 'Elder Support', 'Child Support', 'Pharmacy Needed', 'Blood Required', 'Security'].map(skill => (
                          <label key={skill} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={regData.skills.includes(skill)}
                              onChange={(e) => {
                                if (e.target.checked) setRegData({ ...regData, skills: [...regData.skills, skill] });
                                else setRegData({ ...regData, skills: regData.skills.filter(s => s !== skill) });
                              }}
                              style={{ accentColor: 'var(--brand-primary)', width: '16px', height: '16px' }}
                            />
                            {skill}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Experience Level</label>
                      <select required value={regData.experience_level} onChange={e => setRegData({ ...regData, experience_level: e.target.value })} style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none', appearance: 'none' }}>
                        <option value="Beginner">Beginner (Willing to help)</option>
                        <option value="Intermediate">Intermediate (Previous experience)</option>
                        <option value="Expert">Expert (Trained personnel)</option>
                        <option value="Professional">Professional (Active duty/Certified)</option>
                      </select>
                    </div>
                  </>
                )}

                <button type="submit" disabled={loadingCode} style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'linear-gradient(135deg, var(--brand-primary), #1d4ed8)', border: 'none', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: loadingCode ? 'wait' : 'pointer', marginTop: '0.5rem' }}>
                  {loadingCode ? 'Registering...' : `Register as ${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}`}
                </button>
                <button type="button" onClick={() => setAuthMode('login')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  ← Back to Login
                </button>
              </form>
            </>
          )}

          {authMode === 'forgot' && (
            <>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Reset Password</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Enter your email to receive a reset link.</p>
              <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Email</label>
                  <input required value={regData.email} onChange={e => setRegData({ ...regData, email: e.target.value })} type="email" placeholder="agent@crisisgrid.com" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>
                <button type="submit" style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'linear-gradient(135deg, var(--brand-warning), #d97706)', border: 'none', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                  Send Reset Link
                </button>
                <button type="button" onClick={() => setAuthMode('login')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  ← Back to Login
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── VOLUNTEER DASHBOARD ──────────────────────────────────────────
  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>

      {showReminder && (
        <div className="animate-slide-up" style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, padding: '1rem 2rem', background: 'rgba(245, 158, 11, 0.95)', borderRadius: '12px', border: '1px solid var(--brand-warning)', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }}>
          <Bell size={20} color="white" />
          <span style={{ fontWeight: 700, color: 'white' }}>⏰ 15 minutes elapsed — Has the mission been completed?</span>
        </div>
      )}

      {/* Header */}
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
          <button onClick={handleLogout} title="Logout" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.45rem 0.75rem', color: 'var(--brand-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
            <LogOut size={13} /> Logout
          </button>
        </div>
      </div>

      <div className="flex" style={{ gap: '1.5rem', flexWrap: 'wrap' }}>

        {/* Task Board */}
        <div style={{ flex: '1 1 480px' }}>

          {aiSuggestedTask && !activeTask && (
            <div className="glass shadow-lg animate-slide-up neon-border" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'rgba(59,130,246,0.1)' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: '1.25rem' }}>
                <div style={{ position: 'relative' }}>
                  <Activity size={20} color="var(--brand-primary)" />
                  <div style={{ position: 'absolute', inset: -4, border: '1px solid var(--brand-primary)', borderRadius: '50%', animation: 'radarSweep 2s linear infinite' }} />
                </div>
                <span style={{ fontWeight: 900, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.85rem' }}>Dynamic Routing AI — Nearest Emergency</span>
              </div>
              <div style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', borderLeft: `4px solid ${aiSuggestedTask.priority === 'HIGH' ? 'var(--brand-danger)' : 'var(--brand-success)'}` }}>
                <div className="flex justify-between items-center">
                  <h3 style={{ fontWeight: 800, margin: 0, fontSize: '1.1rem' }}>{aiSuggestedTask.type}</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--brand-primary)', fontWeight: 800 }}>
                    {aiSuggestedTask._calcDist < 999 ? `${aiSuggestedTask._calcDist.toFixed(1)} km away` : ''}
                  </span>
                </div>
                {aiSuggestedTask.phone && <p style={{ fontSize: '0.85rem', color: 'var(--brand-warning)', margin: '0.5rem 0', fontWeight: 600 }}>📞 {aiSuggestedTask.phone}</p>}
                {aiSuggestedTask.description?.includes('📍 Location:') && (
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem 1rem', borderRadius: '8px', marginTop: '1rem', borderLeft: '2px solid var(--brand-primary)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <MapPin size={18} color="var(--brand-primary)" style={{ marginTop: '2px' }} />
                    <div>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Target Destination</span>
                      <strong style={{ fontSize: '0.9rem', color: 'white' }}>{aiSuggestedTask.description.split('📍 Location:')[1].trim()}</strong>
                    </div>
                  </div>
                )}
                {aiSuggestedTask.notes && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0.75rem 0 0' }}>&quot;{aiSuggestedTask.notes}&quot;</p>}
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.75rem 0 1.25rem', lineHeight: 1.5 }}>
                  {aiSuggestedTask.description?.split('📍 Location:')[0].trim()}
                </p>
                <button onClick={() => handleAssign(aiSuggestedTask)} className="btn btn-primary" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
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
            {pendingTasks.slice().sort((a, b) => {
              const pMap = { HIGH: 3, MEDIUM: 2, LOW: 1 };
              const pA = pMap[a.priority] || 0;
              const pB = pMap[b.priority] || 0;
              if (pA !== pB) return pB - pA;
              return (a._calcDist || 999) - (b._calcDist || 999);
            }).map((req, i) => (
              <div key={req.id} className="glass animate-slide-up" style={{ padding: '1.25rem', flexShrink: 0, animationDelay: `${i * 0.05}s`, borderLeft: `4px solid ${req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)'}`, opacity: activeTask ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                <div className="flex justify-between items-center" style={{ marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '6px', background: req.priority === 'HIGH' ? 'rgba(239,68,68,0.15)' : req.priority === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)' }}>{req.priority || 'UNKNOWN'}</span>
                  {req._calcDist < 999 && <span style={{ fontSize: '0.75rem', color: 'var(--brand-primary)', fontWeight: 600 }}>📍 {req._calcDist.toFixed(1)} km</span>}
                </div>
                <h3 style={{ fontWeight: 700, marginBottom: '0.25rem', fontSize: '1rem' }}>{req.type || 'Emergency Signal'}</h3>
                {req.phone && <p style={{ fontSize: '0.8rem', color: 'var(--brand-warning)', margin: '0.3rem 0', fontWeight: 600 }}>📞 {req.phone}</p>}
                {req.description?.includes('📍 Location:') && (
                  <p style={{ fontSize: '0.8rem', color: 'white', fontWeight: 600, margin: '0.5rem 0', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MapPin size={14} color="var(--brand-primary)" />
                    {req.description.split('📍 Location:')[1].trim()}
                  </p>
                )}
                {req.notes && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0.3rem 0' }}>&quot;{req.notes}&quot;</p>}
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                  {req.description ? req.description.split('📍 Location:')[0].trim() : 'No additional description.'}
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
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Mission Timer</p>
                <div style={{ fontSize: '3.5rem', fontWeight: 900, color: timerColor, fontFamily: 'monospace', lineHeight: 1, transition: 'color 0.5s' }}>
                  {formatTime(timeLeft)}
                </div>
                {timeLeft === 0 && <p style={{ color: 'var(--brand-danger)', fontWeight: 700, marginTop: '0.5rem', fontSize: '0.875rem' }}>⚠ Time limit reached!</p>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <Navigation size={24} color="var(--brand-primary)" />
              </div>
              <h3 style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Mission Active</h3>
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                {activeTask.type} · {activeTask._calcDist < 999 ? `${activeTask._calcDist?.toFixed(1)} km away` : 'Navigating...'}
              </p>
              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
                {activeTask.phone && (
                  <p style={{ fontSize: '0.9rem', color: 'var(--brand-warning)', fontWeight: 700, textAlign: 'center', marginBottom: '0.75rem' }}>
                    📞 Call Victim: {activeTask.phone}
                  </p>
                )}
                {activeTask.description?.includes('📍 Location:') && (
                  <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--brand-primary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '0.25rem', textAlign: 'center' }}>Target Destination</p>
                    <p style={{ fontSize: '0.95rem', color: 'white', fontWeight: 600, textAlign: 'center' }}>
                      <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: '0.2rem' }} color="var(--brand-danger)" />
                      {activeTask.description.split('📍 Location:')[1].trim()}
                    </p>
                  </div>
                )}
                {activeTask.notes && <p style={{ fontSize: '0.875rem', fontStyle: 'italic', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.5rem' }}>&quot;{activeTask.notes}&quot;</p>}
                <p style={{ fontSize: '0.875rem', fontStyle: 'italic', color: 'var(--brand-warning)', lineHeight: 1.5, textAlign: 'center' }}>
                  &quot;{activeTask.description?.split('📍 Location:')[0].trim()}&quot;
                </p>
                {activeTask.lat && activeTask.lng && (
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.75rem', textAlign: 'center' }}>
                    GPS: {parseFloat(activeTask.lat).toFixed(5)}°, {parseFloat(activeTask.lng).toFixed(5)}°
                  </p>
                )}
              </div>
              {activeTask.lat && activeTask.lng && (
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeTask.lat},${activeTask.lng}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '0.875rem', borderRadius: '10px', background: '#4285F4', color: 'white', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none', marginBottom: '0.75rem' }}>
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
