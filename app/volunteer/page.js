'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { User, MapPin, CheckCircle, Shield, Navigation, AlertTriangle, Activity, Globe, Clock, Bell, LogOut, X, Power, PowerOff, Volume2, VolumeX } from 'lucide-react';
import { auth, db } from '../utils/firebaseClient';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { useRouter } from 'next/navigation';

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TASK_TIMEOUT_SECS = 20 * 60;
const REMINDER_SECS = 15 * 60;

export default function VolunteerDashboard() {
  const router = useRouter();
  const [onboarded, setOnboarded] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [loadingCode, setLoadingCode] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [requests, setRequests] = useState([]);
  const [uid, setUid] = useState('');
  const [regData, setRegData] = useState({ email: '', password: '', name: '', phone: '', skills: [], experience_level: 'Intermediate' });
  const [wrongRole, setWrongRole] = useState(null); // stores the conflicting role string
  const [volunteerLog, setVolunteerLog] = useState({ assigned: 0, completed: 0 });
  const [volunteerLocation, setVolunteerLocation] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [reminderSent, setReminderSent] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [isActive, setIsActive] = useState(true); // ── Active / Inactive toggle
  const [togglingActive, setTogglingActive] = useState(false);

  // Confirm modal & rejected task tracking
  const [confirmTask, setConfirmTask] = useState(null);
  const [rejectedIds, setRejectedIds] = useState(new Set()); // session-scoped skip list

  const timerRef = useRef(null);
  const reminderSentRef = useRef(false);
  const locationWatchRef = useRef(null);

  // ─── SOS Alert Sound System (WAV Blob approach) ──────────────
  const prevRequestIdsRef = useRef(new Set());
  const [sosAlertVisible, setSosAlertVisible] = useState(false);
  const [newAlertCount, setNewAlertCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const sosAlertTimerRef = useRef(null);
  const alertAudioUrlRef = useRef(null);
  const audioUnlockedRef = useRef(false);

  // Generate emergency siren WAV blob on mount
  useEffect(() => {
    const sampleRate = 44100;
    const duration = 2.2;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    // Write WAV header
    const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    w(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    // Generate emergency siren audio samples
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;

      // Phase 1 (0–0.8s): Oscillating siren 440↔880 Hz
      if (t < 0.8) {
        const freq = 440 + 440 * Math.sin(t * Math.PI * 6);
        sample = Math.sin(2 * Math.PI * freq * t) * 0.35;
        sample *= Math.min(1, t * 10) * Math.min(1, (0.8 - t) * 5);
      }
      // Phase 2 (0.85–1.3s): Three urgent beeps at 1200 Hz
      else if (t >= 0.85 && t < 1.35) {
        const segT = t - 0.85;
        const beepIdx = Math.floor(segT / 0.167);
        const beepPos = segT % 0.167;
        if (beepIdx < 3 && beepPos < 0.1) {
          sample = Math.sin(2 * Math.PI * 1200 * t) * 0.3;
          sample *= Math.min(1, beepPos * 40) * Math.min(1, (0.1 - beepPos) * 40);
        }
      }
      // Phase 3 (1.45–2.1s): Sweeping alarm 600→1100 Hz
      else if (t >= 1.45 && t < 2.1) {
        const p = (t - 1.45) / 0.65;
        const freq = 600 + 500 * p;
        sample = Math.sin(2 * Math.PI * freq * t) * 0.25 * (1 - p * 0.8);
      }

      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32000, true);
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    alertAudioUrlRef.current = URL.createObjectURL(blob);

    return () => {
      if (alertAudioUrlRef.current) URL.revokeObjectURL(alertAudioUrlRef.current);
    };
  }, []);

  // Unlock audio on first user interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;
      // Play a tiny silent audio to satisfy browser autoplay requirements
      try {
        const a = new Audio(alertAudioUrlRef.current);
        a.volume = 0.01;
        a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
      } catch (e) { /* ignore */ }
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Play the alert sound
  const playSOSAlert = useCallback(() => {
    if (!soundEnabled || !alertAudioUrlRef.current) return;
    try {
      const audio = new Audio(alertAudioUrlRef.current);
      audio.volume = 1.0;
      audio.play().catch(err => console.warn('Alert play failed:', err));
    } catch (e) {
      console.warn('Could not play SOS alert:', e);
    }
  }, [soundEnabled]);


  // ─── Auth State Listener ──────────────────────────────────────
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
            if (role === 'admin') { router.push('/dashboard'); return; }
            if (role === 'pharmacy') {
              // Don't silently redirect — show a clear "wrong role" screen
              setWrongRole('pharmacy');
              setOnboarded(false);
              setLoadingCode(false);
              return;
            }
            if (role !== 'volunteer') { await signOut(auth); return; }
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
            setRegData(prev => ({ ...prev, name: d.name || '', phone: d.phone || '', skills: d.skills || [], experience_level: d.experience_level || 'Intermediate', email }));

            // Load persisted trust score counts
            if (d.missions_assigned !== undefined || d.missions_completed !== undefined) {
              setVolunteerLog({ assigned: d.missions_assigned || 0, completed: d.missions_completed || 0 });
            }

            // Load active/inactive status
            setIsActive(d.is_active !== false); // default true if field missing

            // Restore active task if already accepted
            if (d.active_task_id && d.active_task_status === 'accepted') {
              try {
                const taskSnap = await getDoc(doc(db, 'sos_requests', d.active_task_id));
                if (taskSnap.exists() && taskSnap.data().status === 'accepted') {
                  setActiveTask({ id: taskSnap.id, ...taskSnap.data() });
                }
              } catch {}
            }
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

  // ─── GPS ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!onboarded) return;

    const fetchIPLocation = async () => {
      try {
        const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
        const data = await res.json();
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          setVolunteerLocation(prev => prev || { lat, lng });
        }
      } catch (err) {
        console.warn('IP fallback failed', err);
      }
    };

    if (!navigator.geolocation) {
      fetchIPLocation();
      return;
    }

    locationWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => setVolunteerLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        console.warn('Volunteer GPS Error:', err);
        setVolunteerLocation(prev => {
          if (!prev) fetchIPLocation();
          return prev;
        });
      },
      { enableHighAccuracy: false, maximumAge: 10000, timeout: 20000 }
    );
    return () => { if (locationWatchRef.current) navigator.geolocation.clearWatch(locationWatchRef.current); };
  }, [onboarded]);

  // ─── Sync GPS to Firestore ────────────────────────────────────
  useEffect(() => {
    if (!db || !uid || !volunteerLocation) return;
    const status = activeTask ? 'On Mission' : isActive ? 'Active' : 'Inactive';
    setDoc(doc(db, 'volunteers', uid), {
      location: volunteerLocation, // Save complete location object for the victim's tracker!
      lat: volunteerLocation.lat,
      lng: volunteerLocation.lng,
      status,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    }, { merge: true }).catch(() => {});
  }, [volunteerLocation, uid, activeTask, isActive]);

  // ─── Load SOS requests — sirf 'pending' wale ─────────────────
  // Use refs to read volatile state inside snapshot without causing resubscription
  const isActiveRef = useRef(isActive);
  const activeTaskRef = useRef(activeTask);
  const playSOSAlertRef = useRef(playSOSAlert);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { activeTaskRef.current = activeTask; }, [activeTask]);
  useEffect(() => { playSOSAlertRef.current = playSOSAlert; }, [playSOSAlert]);

  const loadRequests = useCallback(() => {
    if (!db) return;
    const q = query(collection(db, 'sos_requests'), where('status', '==', 'pending'));
    return onSnapshot(q, (snapshot) => {
      const newRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const newIds = new Set(newRequests.map(r => r.id));

      // Detect genuinely NEW requests (not previously seen)
      const prevIds = prevRequestIdsRef.current;
      const freshIds = [...newIds].filter(id => !prevIds.has(id));

      if (freshIds.length > 0 && prevIds.size > 0 && isActiveRef.current && !activeTaskRef.current) {
        // New SOS detected! Play alert and show banner
        playSOSAlertRef.current();
        setNewAlertCount(freshIds.length);
        setSosAlertVisible(true);
        clearTimeout(sosAlertTimerRef.current);
        sosAlertTimerRef.current = setTimeout(() => setSosAlertVisible(false), 8000);
      }

      prevRequestIdsRef.current = newIds;
      setRequests(newRequests);
    });
  }, []); // ← ZERO deps — Firestore listener stays connected

  useEffect(() => {
    if (!onboarded) return;
    const unsub = loadRequests();
    return () => { if (unsub) unsub(); };
  }, [onboarded, loadRequests]);

  // ─── Dynamic Mission Timer ───────────────────────────────────
  useEffect(() => {
    if (!activeTask) {
      clearInterval(timerRef.current);
      setTimeLeft(null);
      setReminderSent(false);
      reminderSentRef.current = false;
      setShowReminder(false);
      return;
    }

    // Dynamic calculation: target timestamp from task or default 20m
    const timerEnd = activeTask.target_res_time || (Date.now() + 20 * 60 * 1000);
    const initialLeft = Math.max(0, Math.floor((timerEnd - Date.now()) / 1000));
    setTimeLeft(initialLeft);

    setReminderSent(false);
    reminderSentRef.current = false;

    timerRef.current = setInterval(() => {
      setTimeLeft(() => {
        const remaining = Math.floor((timerEnd - Date.now()) / 1000);
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          return 0;
        }
        
        // Push a reminder if exactly 3 minutes left
        if (remaining === 3 * 60 && !reminderSentRef.current) {
          reminderSentRef.current = true;
          setReminderSent(true);
          setShowReminder(true);
          setTimeout(() => setShowReminder(false), 8000);
        }
        return remaining;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [activeTask]);

  const formatTime = (secs) => {
    if (secs == null) return '--:--';
    return `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
  };

  const timerColor = timeLeft == null ? 'var(--brand-primary)'
    : timeLeft < 60 ? 'var(--brand-danger)'
    : timeLeft < 300 ? 'var(--brand-warning)'
    : 'var(--brand-success)';

  // ─── Auth handlers ────────────────────────────────────────────
  const handleAuth = async (e) => {
    e.preventDefault();
    if (!auth) { alert('Offline Mode. Auth disabled.'); return; }
    setLoadingCode(true);
    try {
      await setPersistence(auth, browserSessionPersistence);
      if (authMode === 'register') {
        const userCred = await createUserWithEmailAndPassword(auth, regData.email, regData.password);
        if (db) {
          try {
            await setDoc(doc(db, 'volunteers', userCred.user.uid), {
              name: regData.name,
              email: regData.email,
              phone: regData.phone || '',
              skills: regData.skills.length > 0 ? regData.skills : ['General Support'],
              experience_level: regData.experience_level,
              status: 'Active',
              is_active: true,
              trust_score: 100,
              updated_at: new Date().toISOString(),
            });
            await setDoc(doc(db, 'users', userCred.user.uid), {
              role: 'volunteer',
              email: regData.email,
              name: regData.name,
            });
            alert('✅ Registration successful! You are now a Volunteer.');
          } catch (error) {
            console.error('Firestore Error:', error);
            alert('Auth created but profile setup failed. Try logging in again.');
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
    setActiveTask(null);
    setOnboarded(false);
    setUid('');
    setWrongRole(null);
    setIsActive(true);
    setRegData({ email: '', password: '', name: '', phone: '', skills: [], experience_level: 'Intermediate' });
  };

  // ─── Active / Inactive toggle ─────────────────────────────────
  const handleToggleActive = async () => {
    if (!db || !uid || togglingActive) return;
    // Cannot go inactive while on an active mission
    if (isActive && activeTask) {
      alert('⚠️ Complete or abort your current mission before going off duty.');
      return;
    }
    setTogglingActive(true);
    const next = !isActive;
    try {
      await setDoc(doc(db, 'volunteers', uid), {
        is_active: next,
        status: next ? 'Active' : 'Inactive',
        updated_at: new Date().toISOString(),
      }, { merge: true });
      setIsActive(next);
    } catch (e) {
      console.error('Toggle active failed:', e);
      alert('Failed to update status. Please try again.');
    } finally {
      setTogglingActive(false);
    }
  };

  // ─── Trust Score sync ─────────────────────────────────────────
  const syncTrustScore = async (currentUid, completed, assigned) => {
    if (!db || !currentUid) return;
    const score = assigned > 0 ? Math.min(100, Math.round((completed / assigned) * 100)) : 100;
    await setDoc(doc(db, 'volunteers', currentUid), {
      trust_score: score,
      missions_assigned: assigned,
      missions_completed: completed,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  };

  // ─── ACCEPT task — volunteer ne confirm kiya ─────────────────
  const handleAccept = async (req) => {
    setConfirmTask(null);

    // Calculate dynamic ETA based on distance
    const dist = (volunteerLocation && req.lat && req.lng) ? getDistanceKm(volunteerLocation.lat, volunteerLocation.lng, req.lat, req.lng) : 999;
    const etaMins = dist < 999 ? Math.max(5, Math.ceil(dist * 2)) : 20;
    const computedTargetTime = Date.now() + (etaMins * 60 * 1000);

    setActiveTask({ ...req, target_res_time: computedTargetTime });

    const volunteerInfo = {
      id: uid,
      name: regData.name || 'Emergency Responder',
      skills: Array.isArray(regData.skills) ? regData.skills : [regData.skills || 'General'],
      experience_level: regData.experience_level || 'Intermediate',
      phone: regData.phone || null,
      location: volunteerLocation || null,
    };

    if (db) {
      // ✅ status: 'accepted' — sirf tab SOS page pe dikhega
      await updateDoc(doc(db, 'sos_requests', req.id), {
        status: 'accepted',
        assigned_volunteer: volunteerInfo,
        accepted_at: new Date().toISOString(),
        target_res_time: computedTargetTime,
      });

      // Volunteer ke profile mein bhi active task save karo
      await setDoc(doc(db, 'volunteers', uid), {
        active_task_id: req.id,
        active_task_status: 'accepted',
        status: 'On Mission',
      }, { merge: true });
    }

    setRequests(prev => prev.filter(r => r.id !== req.id));
    window.dispatchEvent(new Event('sos-updated'));
    setVolunteerLog(prev => {
      const next = { ...prev, assigned: prev.assigned + 1 };
      syncTrustScore(uid, next.completed, next.assigned);
      return next;
    });
  };

  // ─── REJECT / SKIP task ───────────────────────────────────────
  const handleReject = (req) => {
    setConfirmTask(null);
    // Add to session-scoped skip list so task doesn't reappear
    if (req?.id) setRejectedIds(prev => new Set([...prev, req.id]));
  };

  // ─── RESOLVE task ─────────────────────────────────────────────
  const handleResolve = async () => {
    if (!activeTask) return;
    if (db) {
      await updateDoc(doc(db, 'sos_requests', activeTask.id), {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      });
      await setDoc(doc(db, 'volunteers', uid), {
        active_task_id: null,
        active_task_status: null,
        status: 'Active',
      }, { merge: true });
    }
    setActiveTask(null);
    setVolunteerLog(prev => {
      const next = { ...prev, completed: prev.completed + 1 };
      syncTrustScore(uid, next.completed, next.assigned);
      return next;
    });
  };

  // ─── ABORT task ───────────────────────────────────────────────
  const handleAbort = async () => {
    if (!activeTask) return;
    if (db) {
      // Wapas pending karo taaki doosra volunteer le sake
      await updateDoc(doc(db, 'sos_requests', activeTask.id), {
        status: 'pending',
        assigned_volunteer: null,
        accepted_at: null,
      });
      await setDoc(doc(db, 'volunteers', uid), {
        active_task_id: null,
        active_task_status: null,
        status: 'Active',
      }, { merge: true });
    }
    setActiveTask(null);
    setVolunteerLog(prev => {
      syncTrustScore(uid, prev.completed, prev.assigned);
      return prev;
    });
  };

  // ─── AI Task Sorting (excluding rejected tasks) ───────────────
  const pendingTasks = requests
    .filter(req => !rejectedIds.has(req.id)) // filter out session-skipped tasks
    .map(req => {
      const dist = (volunteerLocation && req.lat && req.lng) ? getDistanceKm(volunteerLocation.lat, volunteerLocation.lng, req.lat, req.lng) : 999;
      let matchScore = req.priority === 'HIGH' ? 1000 : req.priority === 'MEDIUM' ? 500 : 100;
      matchScore -= Math.min(dist * 10, 500);
      if (req.analysis?.suggested_specializations && regData.skills.length > 0) {
        req.analysis.suggested_specializations.forEach(s => { if (regData.skills.includes(s)) matchScore += 300; });
      }
      return { ...req, _calcDist: dist, _matchScore: matchScore };
    }).sort((a, b) => b._matchScore - a._matchScore);

  const aiSuggestedTask = pendingTasks[0];
  const trustScore = volunteerLog.assigned > 0 ? Math.min(100, Math.round((volunteerLog.completed / volunteerLog.assigned) * 100)) : 100;
  const trustColor = trustScore >= 90 ? 'var(--brand-success)' : trustScore >= 70 ? 'var(--brand-warning)' : 'var(--brand-danger)';

  // ─── WRONG ROLE SCREEN ──────────────────────────────────────
  if (wrongRole) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="glass animate-slide-up" style={{ padding: '3rem 2.5rem', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: '0.75rem', color: 'var(--brand-warning)' }}>
            Wrong Portal
          </h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '2rem' }}>
            You are currently logged in as a <strong style={{ color: 'white' }}>Pharmacy / NGO</strong> account.<br />
            This portal is only for <strong style={{ color: 'var(--brand-primary)' }}>Task Volunteers</strong>.<br /><br />
            Please sign out and register with a <strong style={{ color: 'white' }}>different email</strong> as a volunteer.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={async () => {
                if (auth) await signOut(auth);
                setWrongRole(null);
                setOnboarded(false);
                setRegData({ email: '', password: '', name: '', phone: '', skills: [], experience_level: 'Intermediate' });
              }}
              style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'linear-gradient(135deg, var(--brand-primary), #1d4ed8)', border: 'none', color: 'white', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Sign Out &amp; Register as Volunteer
            </button>
            <button
              onClick={() => router.push('/pharmacy')}
              style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Go to Pharmacy Portal Instead →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── AUTH GATE ────────────────────────────────────────────────
  if (!onboarded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="glass shadow-lg animate-slide-up" style={{ padding: '3.5rem 3rem', maxWidth: '480px', width: '100%', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-60px', left: '-60px', width: '200px', height: '200px', background: 'rgba(59, 130, 246, 0.25)', filter: 'blur(70px)', borderRadius: '50%', pointerEvents: 'none' }} />

          {authMode === 'login' && (
            <>
              <h2 style={{ fontSize: '2.25rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>Volunteer Login</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', lineHeight: 1.6 }}>Authenticate to access your missions.</p>
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
                  {loadingCode ? 'Authenticating...' : 'Login as Volunteer'}
                </button>
              </form>
              <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                <button onClick={() => setAuthMode('forgot')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem' }}>Forgot password?</button>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  New volunteer? <button onClick={() => setAuthMode('register')} style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontWeight: 700 }}>Register Here →</button>
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  Admin/NGO? <a href="/login" style={{ color: 'var(--brand-warning)', fontWeight: 700, textDecoration: 'none' }}>Login here →</a>
                </p>
              </div>
            </>
          )}

          {authMode === 'register' && (
            <>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1.5rem' }}>Register as Volunteer</h2>
              <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Full Name</label>
                  <input required value={regData.name} onChange={e => setRegData({ ...regData, name: e.target.value })} type="text" placeholder="e.g. Rahul Sharma" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Email</label>
                  <input required value={regData.email} onChange={e => setRegData({ ...regData, email: e.target.value })} type="email" placeholder="volunteer@example.com" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Mobile Number <span style={{ color: 'var(--brand-warning)', fontSize: '0.75rem' }}>(shown to SOS victims)</span></label>
                  <input value={regData.phone} onChange={e => setRegData({ ...regData, phone: e.target.value })} type="tel" placeholder="+91 9XXXXXXXXX" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Password</label>
                  <input required value={regData.password} onChange={e => setRegData({ ...regData, password: e.target.value })} type="password" placeholder="••••••••" minLength="6" style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'white', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Specialized Skills</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {['Medical', 'Food', 'Rescue', 'Shelter', 'Medicine', 'Elder Support', 'Child Support', 'Pharmacy Needed', 'Blood Required', 'Security'].map(skill => (
                      <label key={skill} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={regData.skills.includes(skill)} onChange={(e) => {
                          if (e.target.checked) setRegData({ ...regData, skills: [...regData.skills, skill] });
                          else setRegData({ ...regData, skills: regData.skills.filter(s => s !== skill) });
                        }} style={{ accentColor: 'var(--brand-primary)', width: '16px', height: '16px' }} />
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
                <button type="submit" disabled={loadingCode} style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'linear-gradient(135deg, var(--brand-primary), #1d4ed8)', border: 'none', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: loadingCode ? 'wait' : 'pointer', marginTop: '0.5rem' }}>
                  {loadingCode ? 'Registering...' : 'Register as Volunteer'}
                </button>
                <button type="button" onClick={() => setAuthMode('login')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Back to Login</button>
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
                <button type="submit" style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'linear-gradient(135deg, var(--brand-warning), #d97706)', border: 'none', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginTop: '0.5rem' }}>Send Reset Link</button>
                <button type="button" onClick={() => setAuthMode('login')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Back to Login</button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── VOLUNTEER DASHBOARD ──────────────────────────────────────
  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}>

      {/* ✅ Accept/Reject Confirm Modal */}
      {confirmTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: '440px', padding: '2rem', borderRadius: '20px', border: '1px solid rgba(59,130,246,0.4)', position: 'relative' }}>
            <button onClick={() => setConfirmTask(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>

            <div style={{ marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '6px', background: confirmTask.priority === 'HIGH' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: confirmTask.priority === 'HIGH' ? 'var(--brand-danger)' : 'var(--brand-warning)' }}>
                {confirmTask.priority} PRIORITY
              </span>
            </div>

            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white', marginBottom: '0.5rem' }}>{confirmTask.type || 'Emergency'}</h3>

            {confirmTask.description?.includes('📍 Location:') && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', marginBottom: '0.75rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <MapPin size={16} color="var(--brand-primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '0.875rem', color: 'white', fontWeight: 600 }}>
                  {confirmTask.description.split('📍 Location:')[1].trim()}
                </span>
              </div>
            )}

            {confirmTask.phone && (
              <p style={{ fontSize: '0.875rem', color: 'var(--brand-warning)', fontWeight: 600, marginBottom: '0.75rem' }}>📞 {confirmTask.phone}</p>
            )}

            {confirmTask.notes && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '0.75rem' }}>&quot;{confirmTask.notes}&quot;</p>
            )}

            {confirmTask._calcDist < 999 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-primary)', fontWeight: 700, marginBottom: '1.5rem' }}>
                📍 {confirmTask._calcDist.toFixed(1)} km from your location
              </p>
            )}

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(245,158,11,0.08)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
              ⚠️ Once accepted, this mission is assigned to you. The victim will see your name and contact details on their SOS tracking screen.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => handleReject(confirmTask)}
                style={{ flex: 1, padding: '0.875rem', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--brand-danger)', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}
              >
                ✗ Reject
              </button>
              <button
                onClick={() => handleAccept(confirmTask)}
                style={{ flex: 2, padding: '0.875rem', borderRadius: '10px', background: 'linear-gradient(135deg, var(--brand-success), #059669)', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '0.95rem' }}
              >
                ✓ Accept Mission
              </button>
            </div>
          </div>
        </div>
      )}

      {showReminder && (
        <div className="animate-slide-up" style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, padding: '1rem 2rem', background: 'rgba(245, 158, 11, 0.95)', borderRadius: '12px', border: '1px solid var(--brand-warning)', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }}>
          <Bell size={20} color="white" />
          <span style={{ fontWeight: 700, color: 'white' }}>⏰ 15 minutes elapsed — Has the mission been completed?</span>
        </div>
      )}

      {/* ✅ SOS INCOMING ALERT BANNER */}
      {sosAlertVisible && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 10000,
          padding: '1rem 2rem', borderRadius: '16px', minWidth: '340px', maxWidth: '90vw',
          background: 'linear-gradient(135deg, rgba(239,68,68,0.95), rgba(185,28,28,0.97))',
          border: '2px solid rgba(239,68,68,0.8)',
          boxShadow: '0 0 60px rgba(239,68,68,0.5), 0 12px 40px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          animation: 'sosFlash 0.6s ease-in-out 3',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'sosPulseRing 1s ease-in-out infinite',
            }}>
              <Bell size={22} color="white" />
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 900, color: 'white', fontSize: '1.05rem', letterSpacing: '0.5px' }}>
                🚨 {newAlertCount > 1 ? `${newAlertCount} NEW SOS ALERTS` : 'NEW SOS ALERT!'}
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                Emergency request incoming — check the task board
              </p>
            </div>
          </div>
          <button
            onClick={() => setSosAlertVisible(false)}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} color="white" />
          </button>
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
                Trust Score: {trustScore}% · {volunteerLog.completed}/{Math.max(volunteerLog.completed, volunteerLog.assigned)} Missions
              </span>
            </div>
            {regData.phone && (
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                📞 {regData.phone} <span style={{ color: 'rgba(16,185,129,0.7)', fontSize: '0.65rem' }}>(shared with SOS victims)</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          {/* ── Sound Toggle ── */}
          <button
            onClick={() => setSoundEnabled(prev => !prev)}
            title={soundEnabled ? 'Mute SOS Alerts' : 'Unmute SOS Alerts'}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.75rem', borderRadius: '50px', cursor: 'pointer',
              border: soundEnabled ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(239,68,68,0.4)',
              background: soundEnabled ? 'rgba(59,130,246,0.12)' : 'rgba(239,68,68,0.1)',
              transition: 'all 0.25s', fontFamily: 'inherit',
            }}
          >
            {soundEnabled
              ? <><Volume2 size={14} color="var(--brand-primary)" /><span style={{ fontSize: '0.7rem', color: 'var(--brand-primary)', fontWeight: 700 }}>Alert On</span></>
              : <><VolumeX size={14} color="var(--brand-danger)" /><span style={{ fontSize: '0.7rem', color: 'var(--brand-danger)', fontWeight: 700 }}>Muted</span></>
            }
          </button>

          {volunteerLocation && (
            <div className="animate-pulse-glow" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.875rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '50px' }}>
              <MapPin size={14} color="var(--brand-success)" />
              <span style={{ fontSize: '0.75rem', color: 'var(--brand-success)', fontWeight: 800 }}>GPS Live</span>
            </div>
          )}

          {/* ── Active / Inactive toggle button ── */}
          <button
            onClick={handleToggleActive}
            disabled={togglingActive}
            title={isActive ? 'Go Off Duty (Inactive)' : 'Go On Duty (Active)'}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.45rem',
              padding: '0.4rem 0.875rem', borderRadius: '50px', cursor: togglingActive ? 'wait' : 'pointer',
              border: isActive ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(239,68,68,0.5)',
              background: isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
              transition: 'all 0.25s',
              fontFamily: 'inherit',
            }}
          >
            {isActive
              ? <><Power size={14} color="var(--brand-success)" /><span style={{ fontSize: '0.75rem', color: 'var(--brand-success)', fontWeight: 800 }}>Active</span></>
              : <><PowerOff size={14} color="var(--brand-danger)" /><span style={{ fontSize: '0.75rem', color: 'var(--brand-danger)', fontWeight: 800 }}>Inactive</span></>}
          </button>

          <button onClick={handleLogout} title="Logout" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.45rem 0.75rem', color: 'var(--brand-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontFamily: 'inherit' }}>
            <LogOut size={13} /> Logout
          </button>
        </div>
      </div>

      {/* ── Off Duty Banner ── */}
      {!isActive && (
        <div className="animate-slide-up" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))', border: '1px solid rgba(239,68,68,0.4)', borderLeft: '4px solid var(--brand-danger)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <PowerOff size={22} color="var(--brand-danger)" />
            <div>
              <p style={{ color: '#fca5a5', fontWeight: 800, margin: 0, fontSize: '1rem' }}>You Are Currently Off Duty</p>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', margin: 0 }}>No SOS tasks will be shown while inactive. Toggle Active to resume.</p>
            </div>
          </div>
          <button
            onClick={handleToggleActive}
            disabled={togglingActive}
            style={{ padding: '0.6rem 1.2rem', borderRadius: '10px', background: 'linear-gradient(135deg, var(--brand-success), #059669)', border: 'none', color: 'white', fontWeight: 800, cursor: togglingActive ? 'wait' : 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' }}
          >
            {togglingActive ? 'Updating...' : '⚡ Go Active'}
          </button>
        </div>
      )}

      <div className="flex" style={{ gap: '1.5rem', flexWrap: 'wrap' }}>

        {/* Task Board */}
        <div style={{ flex: '1 1 480px' }}>
          {/* AI Suggested Task */}
          {aiSuggestedTask && !activeTask && isActive && (
            <div className="glass shadow-lg animate-slide-up neon-border" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'rgba(59,130,246,0.1)' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: '1.25rem' }}>
                <Activity size={20} color="var(--brand-primary)" />
                <span style={{ fontWeight: 900, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.85rem' }}>AI Recommended — Nearest Emergency</span>
              </div>
              <div style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', borderLeft: `4px solid ${aiSuggestedTask.priority === 'HIGH' ? 'var(--brand-danger)' : 'var(--brand-success)'}` }}>
                <div className="flex justify-between items-center">
                  <h3 style={{ fontWeight: 800, margin: 0, fontSize: '1.1rem' }}>{aiSuggestedTask.type}</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--brand-primary)', fontWeight: 800 }}>
                    {aiSuggestedTask._calcDist < 999 ? `${aiSuggestedTask._calcDist.toFixed(1)} km` : ''}
                  </span>
                </div>
                {aiSuggestedTask.phone && <p style={{ fontSize: '0.85rem', color: 'var(--brand-warning)', margin: '0.5rem 0', fontWeight: 600 }}>📞 {aiSuggestedTask.phone}</p>}
                {(aiSuggestedTask.locationLabel || aiSuggestedTask.description?.includes('📍 Location:')) && (
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem 1rem', borderRadius: '8px', marginTop: '1rem', borderLeft: '2px solid var(--brand-primary)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <MapPin size={18} color="var(--brand-primary)" style={{ marginTop: '2px' }} />
                    <div>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Location</span>
                      <strong style={{ fontSize: '0.9rem', color: 'white' }}>
                        {aiSuggestedTask.locationLabel || aiSuggestedTask.description?.split('📍 Location:')[1]?.trim() || `${aiSuggestedTask.lat}, ${aiSuggestedTask.lng}`}
                      </strong>
                    </div>
                  </div>
                )}
                {aiSuggestedTask.notes && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0.75rem 0 0' }}>&quot;{aiSuggestedTask.notes}&quot;</p>}
                {/* ✅ Accept/Reject buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                  <button
                    onClick={() => handleReject(aiSuggestedTask)}
                    style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--brand-danger)', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}
                  >
                    ✗ Skip
                  </button>
                  <button
                    onClick={() => setConfirmTask(aiSuggestedTask)}
                    className="btn btn-primary"
                    style={{ flex: 2, padding: '0.75rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    <Navigation size={16} /> Accept This Task
                  </button>
                </div>
              </div>
            </div>
          )}

          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {isActive ? `All Pending Tasks (${pendingTasks.length})` : 'Task Board Paused'}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {!isActive ? (
              <div className="glass" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <PowerOff size={40} style={{ margin: '0 auto 1rem auto', color: 'var(--brand-danger)', opacity: 0.4 }} />
                <p style={{ fontWeight: 600 }}>Task board is hidden while Off Duty</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.7 }}>Toggle yourself Active to start receiving SOS tasks.</p>
              </div>
            ) : pendingTasks.length === 0 ? (
              <div className="glass" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <CheckCircle size={40} style={{ margin: '0 auto 1rem auto', color: 'var(--brand-success)', opacity: 0.5 }} />
                <p style={{ fontWeight: 600 }}>No pending tasks</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.7 }}>Standby &mdash; SOS alerts will appear here.</p>
              </div>
            ) : pendingTasks.map((req, i) => (
              <div key={req.id} className="glass animate-slide-up" style={{ padding: '1.25rem', flexShrink: 0, animationDelay: `${i * 0.05}s`, borderLeft: `4px solid ${req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)'}`, opacity: activeTask ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                <div className="flex justify-between items-center" style={{ marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '6px', background: req.priority === 'HIGH' ? 'rgba(239,68,68,0.15)' : req.priority === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: req.priority === 'HIGH' ? 'var(--brand-danger)' : req.priority === 'MEDIUM' ? 'var(--brand-warning)' : 'var(--brand-success)' }}>{req.priority || 'UNKNOWN'}</span>
                  {req._calcDist < 999 && <span style={{ fontSize: '0.75rem', color: 'var(--brand-primary)', fontWeight: 600 }}>📍 {req._calcDist.toFixed(1)} km</span>}
                </div>
                <h3 style={{ fontWeight: 700, marginBottom: '0.25rem', fontSize: '1rem' }}>{req.type || 'Emergency Signal'}</h3>
                {req.phone && <p style={{ fontSize: '0.8rem', color: 'var(--brand-warning)', margin: '0.3rem 0', fontWeight: 600 }}>📞 {req.phone}</p>}
                {(req.locationLabel || req.description?.includes('📍 Location:')) && (
                  <p style={{ fontSize: '0.8rem', color: 'white', fontWeight: 600, margin: '0.5rem 0', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MapPin size={14} color="var(--brand-primary)" />
                    {req.locationLabel || req.description?.split('📍 Location:')[1]?.trim() || `${req.lat}, ${req.lng}`}
                  </p>
                )}
                {req.notes && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0.3rem 0' }}>&quot;{req.notes}&quot;</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button
                    onClick={() => handleReject(req)}
                    disabled={activeTask !== null}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: activeTask ? 'var(--text-secondary)' : 'var(--brand-danger)', cursor: activeTask ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}
                  >
                    ✗ Reject
                  </button>
                  <button
                    onClick={() => !activeTask && setConfirmTask(req)}
                    disabled={activeTask !== null}
                    className="btn btn-secondary"
                    style={{ flex: 2, padding: '0.5rem', borderRadius: '8px', cursor: activeTask ? 'not-allowed' : 'pointer', fontSize: '0.875rem' }}
                  >
                    {activeTask ? 'Mission in Progress...' : '✓ Accept'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Mission Panel */}
        <div style={{ flex: '1 1 320px' }}>
          {activeTask ? (
            <div className="glass" style={{ padding: '2rem', border: '1px solid var(--brand-primary)', boxShadow: '0 0 40px rgba(59,130,246,0.15)', position: 'sticky', top: '90px' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>Mission Timer</p>
                <div style={{ fontSize: '3.5rem', fontWeight: 900, color: timerColor, fontFamily: 'monospace', lineHeight: 1, transition: 'color 0.5s' }}>{formatTime(timeLeft)}</div>
                {timeLeft === 0 && <p style={{ color: 'var(--brand-danger)', fontWeight: 700, marginTop: '0.5rem', fontSize: '0.875rem' }}>⚠ Time limit reached!</p>}
              </div>
              <h3 style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Mission Active</h3>
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                {activeTask.type} · {activeTask._calcDist < 999 ? `${activeTask._calcDist?.toFixed(1)} km` : 'Navigating...'}
              </p>
              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
                {activeTask.phone && (
                  <a href={`tel:${activeTask.phone}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--brand-warning)', fontWeight: 700, textAlign: 'center', marginBottom: '0.75rem', textDecoration: 'none' }}>
                    📞 Call Victim: {activeTask.phone}
                  </a>
                )}
                {activeTask.description?.includes('📍 Location:') && (
                  <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--brand-primary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '0.25rem', textAlign: 'center' }}>Target Destination</p>
                    <p style={{ fontSize: '0.95rem', color: 'white', fontWeight: 600, textAlign: 'center' }}>
                      {activeTask.description.split('📍 Location:')[1].trim()}
                    </p>
                  </div>
                )}
                {activeTask.notes && <p style={{ fontSize: '0.875rem', fontStyle: 'italic', color: 'var(--text-secondary)', textAlign: 'center' }}>&quot;{activeTask.notes}&quot;</p>}
              </div>
              {activeTask.lat && activeTask.lng && (
                <a href={`https://www.google.com/maps/dir/?api=1&origin=${volunteerLocation?.lat},${volunteerLocation?.lng}&destination=${activeTask.lat},${activeTask.lng}`} target="_blank" rel="noopener noreferrer"
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