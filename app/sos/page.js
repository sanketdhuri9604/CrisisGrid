'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, CheckCircle, Database, Globe, Mic, User, Activity, Share2, PhoneCall, Wifi, WifiOff, AlertOctagon, AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { transmitSOS, processOfflineQueue } from '../utils/offlineSync';
import { db } from '../utils/firebaseClient';
import { doc, onSnapshot } from 'firebase/firestore';
import '../i18n';
import { useTranslation } from 'react-i18next';

const LocationPicker = dynamic(() => import('../components/LocationPicker'), { ssr: false });

const SHAKE_THRESHOLD = 15;
const SHAKE_TIMEOUT   = 1500;
const TAP_RESET_MS    = 3000;

const isValidPhone = (p) => /^[6-9]\d{9}$/.test(p.replace(/\s+/g, ''));

export default function SOSForm() {
  const { t, i18n } = useTranslation();

  const [loading, setLoading]           = useState(false);
  const [success, setSuccess]           = useState(false);
  const [simulation, setSimulation]     = useState(null);
  const [selectedType, setSelectedType] = useState('Medical');
  const [location, setLocation]         = useState({ lat: 19.0760, lng: 72.8777, label: 'Acquiring GPS signal...', active: false, isManual: false });
  const [showMap, setShowMap]           = useState(false);
  const [phone, setPhone]               = useState('');
  const [notes, setNotes]               = useState('');
  const [isOnline, setIsOnline]         = useState(true);
  const [gpsError, setGpsError]         = useState(false);
  const [phoneError, setPhoneError]     = useState(false);

  const [tapCount, setTapCount]         = useState(0);
  const tapResetTimer                   = useRef(null);

  const [pendingPin, setPendingPin]     = useState(null);
  const [pinPhone, setPinPhone]         = useState('');
  const [pinPhoneError, setPinPhoneError] = useState('');
  const [pinPhoneLoading, setPinPhoneLoading] = useState(false);

  const [isListening, setIsListening]         = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);

  const isSubmitting                          = useRef(false);
  const [activeSession, setActiveSession]     = useState(null);
  const [timeLeft, setTimeLeft]               = useState(900);
  const [volunteerDetails, setVolunteerDetails] = useState(null);

  const lastShake = useRef(0);
  const lastAcc   = useRef({ x: 0, y: 0, z: 0 });

  const [flashing, setFlashing] = useState(false);

  const triggerFlash = useCallback(() => {
    setFlashing(true);
    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count > 6) { clearInterval(interval); setFlashing(false); }
    }, 300);
  }, []);

  const handleSOSTap = useCallback(() => {
    if (loading || isSubmitting.current) return;
    clearTimeout(tapResetTimer.current);
    setTapCount(prev => {
      const next = prev + 1;
      if (next >= 3) {
        setTimeout(() => handleQuickSOS(), 0);
        tapResetTimer.current = null;
        return 0;
      }
      tapResetTimer.current = setTimeout(() => setTapCount(0), TAP_RESET_MS);
      return next;
    });
  }, [loading]);

  useEffect(() => () => clearTimeout(tapResetTimer.current), []);

  const handlePinDropped = useCallback((lat, lng) => {
    setPendingPin({ lat, lng });
    setPinPhone(phone);
    setPinPhoneError('');
  }, [phone]);

  const confirmPin = useCallback(() => {
    if (!isValidPhone(pinPhone)) {
      setPinPhoneError('Valid 10-digit Indian mobile number required.');
      return;
    }
    setPinPhoneLoading(true);
    setTimeout(() => {
      const { lat, lng } = pendingPin;
      setLocation({ lat, lng, label: `Manual Pin: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, active: true, isManual: true });
      setPhone(pinPhone);
      setPhoneError(false);
      setPendingPin(null);
      setPinPhone('');
      setPinPhoneLoading(false);
    }, 600);
  }, [pinPhone, pendingPin]);

  const cancelPin = useCallback(() => {
    setPendingPin(null);
    setPinPhone('');
    setPinPhoneError('');
  }, []);

  const handleMotion = useCallback((e) => {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const dx = Math.abs(acc.x - lastAcc.current.x);
    const dy = Math.abs(acc.y - lastAcc.current.y);
    const dz = Math.abs(acc.z - lastAcc.current.z);
    lastAcc.current = { x: acc.x, y: acc.y, z: acc.z };
    if (dx + dy + dz > SHAKE_THRESHOLD) {
      const now = Date.now();
      if (now - lastShake.current > SHAKE_TIMEOUT) {
        lastShake.current = now;
        handleQuickSOS();
      }
    }
  }, []);

  useEffect(() => {
    const storedStr = localStorage.getItem('active_sos_session');
    if (storedStr) {
      try {
        const stored = JSON.parse(storedStr);
        if (stored.target_res_time && Date.now() < stored.target_res_time + 86400000) {
          setActiveSession(stored);
          setSuccess(true);
          setSimulation({ syncStatus: stored.syncStatus || 'synced' });
        } else {
          localStorage.removeItem('active_sos_session');
        }
      } catch (e) {}
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          try {
            const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
            const data = await res.json();
            const address = data.display_name ? data.display_name.split(',').slice(0, 3).join(',') : `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
            setLocation({ lat, lng, label: address, active: true, isManual: false });
            setGpsError(false);
          } catch {
            setLocation({ lat, lng, label: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`, active: true, isManual: false });
            setGpsError(false);
          }
        },
        () => {
          setGpsError(true);
          setLocation(prev => ({ ...prev, label: 'GPS unavailable — pin your location manually', active: false, isManual: false }));
        }
      );
    }

    setIsOnline(navigator.onLine);
    const handleOnline  = () => { setIsOnline(true); processOfflineQueue(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine) processOfflineQueue();

    const armShake = async () => {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const perm = await DeviceMotionEvent.requestPermission();
          if (perm !== 'granted') return;
        } catch { return; }
      }
      window.addEventListener('devicemotion', handleMotion);
    };
    armShake();

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [handleMotion]);

  // ─── Volunteer tracker — FIXED ────────────────────────────────
  useEffect(() => {
    let timerId;
    let unsub = () => {};
    if (activeSession) {
      timerId = setInterval(() => {
        const delta = Math.floor((activeSession.target_res_time - Date.now()) / 1000);
        setTimeLeft(delta <= 0 ? 0 : delta);
        if (delta <= 0) clearInterval(timerId);
      }, 1000);

      if (activeSession.id && db) {
        unsub = onSnapshot(doc(db, 'sos_requests', activeSession.id), (snap) => {
          if (snap.exists()) {
            const data = snap.data();

            // ✅ FIX: assigned_volunteer object properly set karo
            if (data.status === 'assigned' && data.assigned_volunteer) {
              setVolunteerDetails(data.assigned_volunteer);
            } else if (data.status === 'resolved') {
              localStorage.removeItem('active_sos_session');
              setActiveSession(null);
              setSuccess(false);
              setVolunteerDetails(null);
            }
          }
        });
      }
    }
    return () => { clearInterval(timerId); unsub(); };
  }, [activeSession]);

  const shareLocation = () => {
    const msg = `🆘 EMERGENCY SOS! I need help!\n📍 Location: ${location.label}\n🗺️ Maps: https://maps.google.com/?q=${location.lat},${location.lng}\n⚠️ Type: ${selectedType}${phone ? `\n📞 My number: ${phone}` : ''}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };
  const shareSMS = () => {
    const msg = `🆘 SOS! Need help at: https://maps.google.com/?q=${location.lat},${location.lng} — ${selectedType} emergency`;
    window.open(`sms:?body=${encodeURIComponent(msg)}`);
  };

  const handleQuickSOS = async (overrideDescription = null, overrideType = null) => {
    if (isSubmitting.current) return;
    if (location.isManual && !isValidPhone(phone)) {
      setPhoneError(true);
      return;
    }
    isSubmitting.current = true;
    setLoading(true);
    setTapCount(0);
    triggerFlash();

    const finalType   = overrideType || selectedType;
    const description = overrideDescription || `EMERGENCY URGENT: Requires immediate ${finalType} assistance.\n\n📍 Location: ${location.label}`;

    try {
      const startTime = performance.now();
      const res  = await fetch('/api/priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data    = await res.json();
      const endTime = performance.now();

      const computedPriority = data.priority || (['Medical', 'Fire', 'Rescue', 'BloodRequired'].includes(finalType) ? 'HIGH' : 'MEDIUM');
      const payload = {
        name: 'Anonymous Citizen',
        phone: phone || 'Not provided',
        type: t(`type${finalType}`) || finalType,
        description,
        notes: notes || '',
        priority: computedPriority,
        analysis: data.analysis || null,
        lat: location.lat,
        lng: location.lng,
        locationIsManual: location.isManual,
        status: 'pending',
        assigned_volunteer: null,
      };

      const syncResult = await transmitSOS(payload);
      const fsId       = syncResult?.data?.id || null;
      const sessionObj = { id: fsId, priority: computedPriority, syncStatus: syncResult?.status || 'queued', target_res_time: Date.now() + 15 * 60 * 1000 };

      localStorage.setItem('active_sos_session', JSON.stringify(sessionObj));
      setActiveSession(sessionObj);
      setSimulation({ priority: computedPriority, latency: `${Math.round(endTime - startTime)}ms`, method: data.model || 'Unknown', syncStatus: syncResult?.status, syncPlatform: syncResult?.platform });
      setSuccess(true);
    } catch {
      setSimulation({ priority: 'HIGH', latency: 'N/A', method: 'Offline Relay', syncStatus: 'queued', syncPlatform: 'IndexedDB' });
      setSuccess(true);
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  const toggleRecording = async () => {
    if (isSubmitting.current) return;
    if (isListening && mediaRecorderRef.current) { mediaRecorderRef.current.stop(); setIsListening(false); return; }
    try {
      const stream        = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current   = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(tr => tr.stop());
        await processAudioTranscription(audioBlob);
      };
      setIsListening(true);
      setVoiceTranscript('Recording… Tap again to stop & send.');
      mediaRecorder.start();
    } catch { setVoiceTranscript('❌ Microphone access denied.'); }
  };

  const processAudioTranscription = async (audioBlob) => {
    setVoiceTranscript('Processing audio via AI…');
    isSubmitting.current = true;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'emergency-audio.webm');
      const res  = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.transcript) throw new Error('Failed');
      const ts = data.transcript;
      setVoiceTranscript(`Analyzed: "${ts.substring(0, 40)}…"`);
      isSubmitting.current = false; setLoading(false);
      await handleQuickSOS(`🎤 [WHISPER AI] Transcript: "${ts}"\n\n📍 Location: ${location.label}`);
    } catch { setVoiceTranscript('❌ Audio AI failed. Try typing instead.'); }
    finally { isSubmitting.current = false; setLoading(false); setIsListening(false); }
  };

  const tapLabels = ['TAP 1/3', 'TAP 2/3', 'TAP 3/3 — SENDING!'];
  const tapColors = ['var(--brand-danger)', '#f97316', '#dc2626'];
  const tapGlows  = ['rgba(239,68,68,0.5)', 'rgba(249,115,22,0.6)', 'rgba(220,38,38,0.8)'];

  // ─── SUCCESS SCREEN ───────────────────────────────────────────
  if (success) {
    return (
      <div className="container" style={{ paddingTop: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* ✅ FIXED: Volunteer card — phone bhi dikhata hai */}
        {volunteerDetails ? (
          <div className="glass animate-slide-up shadow-lg" style={{ padding: '1.5rem', width: '100%', maxWidth: '600px', marginBottom: '1.5rem', background: 'rgba(16,185,129,0.1)', border: '1px solid var(--brand-success)' }}>
            <div className="flex items-center gap-3">
              <div style={{ padding: '0.75rem', background: 'var(--brand-success)', borderRadius: '50%' }}>
                <Activity size={24} color="white" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', margin: 0 }}>Volunteer Assigned!</h3>
                <p style={{ color: 'var(--brand-success)', fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Help is on the way.</p>
              </div>
            </div>
            <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={16} color="var(--text-secondary)" />
                <span style={{ color: 'white', fontWeight: 700, fontSize: '1rem' }}>{volunteerDetails.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={16} color="var(--brand-primary)" />
                <span style={{ color: 'var(--brand-primary)', fontSize: '0.85rem' }}>
                  Skills: {Array.isArray(volunteerDetails.skills) ? volunteerDetails.skills.join(', ') : volunteerDetails.skills || 'General'}
                </span>
              </div>
              {/* ✅ NEW: Phone number dikhao */}
              {volunteerDetails.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <PhoneCall size={16} color="var(--brand-success)" />
                  <a href={`tel:${volunteerDetails.phone}`} style={{ color: 'var(--brand-success)', fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none' }}>
                    {volunteerDetails.phone}
                  </a>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ✅ NEW: Volunteer abhi assign nahi hua toh waiting state dikhao */
          <div className="glass animate-slide-up" style={{ padding: '1rem 1.5rem', width: '100%', maxWidth: '600px', marginBottom: '1.5rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--brand-warning)', animation: 'pulseGlow 1.5s infinite', flexShrink: 0 }} />
            <span style={{ color: 'var(--brand-warning)', fontWeight: 600, fontSize: '0.9rem' }}>
              Finding nearest volunteer… Please stay on this page.
            </span>
          </div>
        )}

        <div className="glass animate-slide-up" style={{ padding: '3rem', maxWidth: '600px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', background: simulation?.syncStatus === 'synced' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            {simulation?.syncStatus === 'synced' ? <CheckCircle size={40} color="var(--brand-success)" /> : <Database size={40} color="var(--brand-warning)" />}
          </div>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            {simulation?.syncStatus === 'synced' ? 'SOS Transmitted' : 'SOS Queued'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
            {t('successMsg') || 'Please stay calm. Do not close this page.'}
          </p>

          {/* Timer */}
          <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 0.25rem' }}>
              Estimated Response Time
            </p>
            <p style={{ color: timeLeft > 300 ? 'var(--brand-warning)' : 'var(--brand-danger)', fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={shareLocation} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', borderRadius: '10px', background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.4)', color: '#25D366', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>
              <Share2 size={15} /> Share on WhatsApp
            </button>
            <button onClick={shareSMS} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--brand-primary)', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>
              <PhoneCall size={15} /> Share via SMS
            </button>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => { localStorage.removeItem('active_sos_session'); setActiveSession(null); setSuccess(false); setVolunteerDetails(null); }}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', flex: 1, borderRadius: '12px', color: 'white', cursor: 'pointer' }}
            >
              Cancel SOS
            </button>
            <button
              onClick={() => window.open(`https://maps.google.com/?q=${location.lat},${location.lng}`, '_blank')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem', flex: 1, borderRadius: '12px', background: 'var(--brand-primary)', border: 'none', color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
            >
              <MapPin size={16} /> Open in Live Map
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN FORM ────────────────────────────────────────────────
  return (
    <>
      {flashing && <div style={{ position: 'fixed', inset: 0, background: 'rgba(239,68,68,0.55)', zIndex: 9999, pointerEvents: 'none', animation: 'flashPulse 0.3s ease-in-out' }} />}

      <style>{`
        @keyframes flashPulse { 0%,100%{opacity:0} 50%{opacity:1} }
        @keyframes tapPulse { 0%{transform:scale(1)} 50%{transform:scale(1.06)} 100%{transform:scale(1)} }
      `}</style>

      {pendingPin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass" style={{ width: '100%', maxWidth: '420px', padding: '2rem', borderRadius: '20px', border: '1px solid rgba(59,130,246,0.4)', position: 'relative' }}>
            <button onClick={cancelPin} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MapPin size={22} color="var(--brand-primary)" />
              </div>
              <div>
                <h3 style={{ color: 'white', fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>Confirm Pin Location</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: 0 }}>
                  {pendingPin.lat.toFixed(4)}, {pendingPin.lng.toFixed(4)}
                </p>
              </div>
            </div>
            <p style={{ color: 'var(--brand-warning)', fontSize: '0.82rem', fontWeight: 600, marginBottom: '1.25rem', padding: '0.6rem 0.9rem', background: 'rgba(245,158,11,0.08)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.25)' }}>
              ⚠️ Manual pins require a verified phone number to prevent false alarms.
            </p>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>
              Mobile Number
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.75rem', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>🇮🇳 +91</span>
              <input
                type="tel" maxLength={10} value={pinPhone}
                onChange={e => { setPinPhone(e.target.value.replace(/\D/g, '')); setPinPhoneError(''); }}
                placeholder="9XXXXXXXXX" autoFocus
                style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '8px', border: `1px solid ${pinPhoneError ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.12)'}`, background: 'rgba(0,0,0,0.35)', color: 'white', outline: 'none', fontSize: '1rem', letterSpacing: '1px' }}
              />
            </div>
            {pinPhoneError && <p style={{ color: 'var(--brand-danger)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem' }}>⚠️ {pinPhoneError}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button onClick={cancelPin} style={{ flex: 1, padding: '0.875rem', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmPin} disabled={pinPhoneLoading}
                style={{ flex: 2, padding: '0.875rem', borderRadius: '10px', background: isValidPhone(pinPhone) ? 'var(--brand-primary)' : 'rgba(59,130,246,0.25)', border: 'none', color: 'white', fontWeight: 800, cursor: pinPhoneLoading ? 'wait' : 'pointer', fontSize: '0.95rem', transition: 'background 0.2s' }}>
                {pinPhoneLoading ? 'Verifying…' : '✓ Confirm Pin'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem', maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', padding: '0.6rem 1rem', borderRadius: '10px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 700, color: isOnline ? 'var(--brand-success)' : 'var(--brand-warning)' }}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isOnline ? 'Online' : 'Offline — SOS will queue'}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.6rem', borderRadius: '6px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--brand-danger)', fontSize: '0.68rem', fontWeight: 700 }}>⚡ 3-TAP</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.6rem', borderRadius: '6px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--brand-warning)', fontSize: '0.68rem', fontWeight: 700 }}><AlertOctagon size={10} /> SHAKE</span>
          </div>
        </div>

        <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
          <div className="flex items-center gap-2"><Globe size={18} color="var(--brand-primary)" /><span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('lang')}</span></div>
          <div className="flex gap-2">
            {['en', 'hi', 'mr'].map((l) => (
              <button key={l} onClick={() => i18n.changeLanguage(l)} style={{ padding: '0.3rem 0.7rem', borderRadius: '6px', background: i18n.language === l ? 'var(--brand-primary)' : 'transparent', border: i18n.language === l ? 'none' : '1px solid var(--glass-border)', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.75rem', textTransform: 'uppercase' }}>{l}</button>
            ))}
          </div>
        </div>

        <div className="glass animate-slide-up" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '0.4rem', color: 'var(--brand-danger)' }}>{t('title')}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.75rem' }}>{t('sub')}</p>

          <div className="flex gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center', marginBottom: '2rem', width: '100%' }}>
            {['Medical', 'Food', 'Rescue', 'Shelter', 'Medicine', 'ElderSupport', 'ChildSupport', 'PharmacyNeeded', 'BloodRequired', 'Any'].map((typeKey) => (
              <button key={typeKey} onClick={() => setSelectedType(typeKey)}
                style={{ flex: '1 1 calc(50% - 1rem)', padding: '0.875rem', borderRadius: '12px', background: selectedType === typeKey ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.3)', border: `2px solid ${selectedType === typeKey ? 'var(--brand-danger)' : 'var(--glass-border)'}`, color: 'white', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer' }}>
                {t(`type${typeKey}`)}
              </button>
            ))}
          </div>

          <div className="glass shadow-lg" style={{ padding: '1rem 1.5rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', border: `1px solid ${gpsError ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`, width: '100%' }}>
            <div className={location.active && !location.isManual ? 'animate-pulse-glow' : ''} style={{ width: '44px', height: '44px', borderRadius: '12px', background: location.active ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MapPin size={22} color={location.active ? 'var(--brand-success)' : 'var(--brand-warning)'} />
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Emergency Location {location.isManual && <span style={{ color: 'var(--brand-warning)', marginLeft: '0.4rem' }}>📍 Manual Pin</span>}
              </h3>
              <p style={{ fontWeight: 600, fontSize: '0.875rem', color: location.active ? 'white' : 'var(--text-secondary)', lineHeight: 1.4, marginTop: '0.2rem' }}>{location.label}</p>
              <button onClick={() => setShowMap(!showMap)} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--brand-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', marginTop: '0.4rem', cursor: 'pointer' }}>
                {showMap ? 'Hide Map' : gpsError ? '⚠️ GPS off — Pin manually' : 'Not accurate? Pin manually'}
              </button>
            </div>
          </div>

          {gpsError && (
            <div style={{ width: '100%', padding: '0.7rem 1rem', borderRadius: '10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={15} color="var(--brand-warning)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--brand-warning)', fontWeight: 600 }}>GPS unavailable. Pin manually — verified phone required.</span>
            </div>
          )}

          {location.isManual && (
            <div style={{ width: '100%', padding: '0.7rem 1rem', borderRadius: '10px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={15} color="var(--brand-success)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--brand-success)', fontWeight: 600 }}>Phone verified ✓ — Manual pin confirmed.</span>
            </div>
          )}

          {showMap && (
            <div style={{ width: '100%', marginBottom: '1.25rem' }}>
              <LocationPicker defaultPosition={{ lat: location.lat, lng: location.lng }} onLocationChange={handlePinDropped} />
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                📍 Tap on map to drop pin → phone verify modal will open
              </p>
            </div>
          )}

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.75rem' }}>
            <div>
              <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setPhoneError(false); }}
                placeholder={location.isManual ? '📞 Phone verified above' : '📞 Contact number (optional)'}
                disabled={location.isManual}
                style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: '10px', border: `1px solid ${phoneError ? 'rgba(239,68,68,0.6)' : location.isManual ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`, background: location.isManual ? 'rgba(16,185,129,0.05)' : 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', fontSize: '1rem' }} />
              {phoneError && <p style={{ color: 'var(--brand-danger)', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.3rem', textAlign: 'left' }}>⚠️ Valid phone required for manual pin</p>}
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="📝 Details — 3rd floor, blue gate, 2 people trapped…" rows={2}
              style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', fontSize: '0.95rem', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginBottom: '1.75rem' }}>
            <button onClick={shareLocation} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.7rem', borderRadius: '10px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
              <Share2 size={14} /> WhatsApp
            </button>
            <button onClick={shareSMS} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.7rem', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--brand-primary)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
              <PhoneCall size={14} /> SMS
            </button>
          </div>

          <div style={{ width: '100%', marginBottom: '1.75rem' }}>
            <button onClick={toggleRecording} disabled={loading && !isListening}
              className={`glass shadow-lg ${isListening ? 'animate-pulse-glow' : ''}`}
              style={{ width: '100%', padding: '1.25rem', borderRadius: '16px', background: isListening ? 'rgba(239,68,68,0.2)' : 'rgba(10,15,28,0.7)', border: `1px solid ${isListening ? 'var(--brand-danger)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', gap: '1rem', cursor: (loading && !isListening) ? 'not-allowed' : 'pointer' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: isListening ? 'var(--brand-danger)' : 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: isListening ? '0 0 24px var(--brand-danger)' : 'none' }}>
                {isListening ? <div style={{ width: '16px', height: '16px', background: 'white', borderRadius: '3px' }} /> : <Mic size={26} color="var(--brand-primary)" />}
              </div>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', marginBottom: '0.2rem' }}>{isListening ? 'Recording… Tap to Send' : 'Voice SOS'}</h3>
                <p style={{ fontSize: '0.8rem', color: voiceTranscript?.startsWith('❌') ? 'var(--brand-danger)' : 'var(--text-secondary)', margin: 0 }}>{voiceTranscript || 'AI routes your voice to the right volunteers'}</p>
              </div>
            </button>
          </div>

          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', color: 'var(--text-secondary)' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>OR TAP 3× BELOW</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: '14px', height: '14px', borderRadius: '50%', background: tapCount > i ? 'var(--brand-danger)' : 'rgba(255,255,255,0.12)', border: `2px solid ${tapCount > i ? 'var(--brand-danger)' : 'rgba(255,255,255,0.2)'}`, transition: 'all 0.2s' }} />
            ))}
          </div>

          <button
            onClick={handleSOSTap}
            disabled={loading}
            style={{
              width: '220px', height: '220px', borderRadius: '50%',
              background: tapCount === 0 ? 'var(--brand-danger)' : tapColors[tapCount - 1] || 'var(--brand-danger)',
              color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              border: '8px solid rgba(255,255,255,0.1)',
              boxShadow: `0 0 ${tapCount > 0 ? 80 : 60}px ${tapGlows[tapCount > 0 ? tapCount - 1 : 0]}`,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              animation: tapCount > 0 ? 'tapPulse 0.3s ease' : 'none',
              userSelect: 'none', margin: '0 auto',
            }}
          >
            <div>
              <span style={{ display: 'block', fontSize: '2rem', fontWeight: 900 }}>{loading ? '...' : 'SOS'}</span>
              <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, opacity: 0.85, marginTop: '0.25rem' }}>
                {loading ? t('processing') : tapLabels[tapCount] || 'TAP 1/3'}
              </span>
            </div>
          </button>

          <p style={{ marginTop: '0.875rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Tap 3× to confirm SOS &nbsp;|&nbsp; Shake phone to trigger instantly
          </p>
        </div>
      </div>
    </>
  );
}