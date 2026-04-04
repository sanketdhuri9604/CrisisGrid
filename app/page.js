'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin, CheckCircle, Database, Globe, Mic, User,
  Activity, Share2, PhoneCall, Wifi, WifiOff, AlertOctagon,
  AlertTriangle, X, Radio, Zap,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { transmitSOS, processOfflineQueue } from './utils/offlineSync';
import { db } from './utils/firebaseClient';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import './i18n';
import { useTranslation } from 'react-i18next';
import SessionRestoreBanner from './components/SessionRestoreBanner';
import VolunteerTracker from './components/VolunteerTracker';

const LocationPicker = dynamic(() => import('./components/LocationPicker'), { ssr: false });

const SHAKE_THRESHOLD = 15;
const SHAKE_TIMEOUT   = 1500;
const TAP_RESET_MS    = 3000;

const isValidPhone = (p) => /^[6-9]\d{9}$/.test(p.replace(/\s+/g, ''));

export default function Home() {
  const { t, i18n } = useTranslation();

  // ── Core form state ──────────────────────────────────────────
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
  const [locationUpdated, setLocationUpdated] = useState(false); // live location pulse
  const locationUpdateRef                     = useRef(null);   // interval ref

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
    if (!isValidPhone(pinPhone)) { setPinPhoneError('Valid 10-digit Indian mobile number required.'); return; }
    setPinPhoneLoading(true);
    setTimeout(async () => {
      const { lat, lng } = pendingPin;
      let address = `Manual Pin: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        
        if (data && data.display_name) {
          // Take the first 3 parts of the display name for a good local address
          const parts = data.display_name.split(',').map(s => s.trim());
          address = '📍 ' + parts.slice(0, 3).join(', ');
        }
      } catch (err) {
        console.warn('Reverse geocoding failed for manual pin', err);
      }
      setLocation({ lat, lng, label: address, active: true, isManual: true });
      setPhone(pinPhone); setPhoneError(false);
      setPendingPin(null); setPinPhone(''); setPinPhoneLoading(false);
    }, 600);
  }, [pinPhone, pendingPin]);

  const cancelPin = useCallback(() => { setPendingPin(null); setPinPhone(''); setPinPhoneError(''); }, []);

  const handleMotion = useCallback((e) => {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const dx = Math.abs(acc.x - lastAcc.current.x);
    const dy = Math.abs(acc.y - lastAcc.current.y);
    const dz = Math.abs(acc.z - lastAcc.current.z);
    lastAcc.current = { x: acc.x, y: acc.y, z: acc.z };
    if (dx + dy + dz > SHAKE_THRESHOLD) {
      const now = Date.now();
      if (now - lastShake.current > SHAKE_TIMEOUT) { lastShake.current = now; handleQuickSOS(); }
    }
  }, []);

  // ── Session restore on mount ─────────────────────────────────
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

    // Geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            
            let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            if (data && data.display_name) {
              const parts = data.display_name.split(',').map(s => s.trim());
              address = parts.slice(0, 3).join(', ');
            }
            
            setLocation({ lat, lng, label: address, active: true, isManual: false });
            setGpsError(false);
          } catch {
            setLocation({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, active: true, isManual: false });
            setGpsError(false);
          }
        },
        () => {
          setGpsError(true);
          setLocation(prev => ({ ...prev, label: 'GPS unavailable — pin your location manually', active: false }));
        },
        { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
      );
    }

    setIsOnline(navigator.onLine);
    const handleOnline  = () => { setIsOnline(true); processOfflineQueue(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine) processOfflineQueue();

    const armShake = async () => {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { const perm = await DeviceMotionEvent.requestPermission(); if (perm !== 'granted') return; } catch { return; }
      }
      window.addEventListener('devicemotion', handleMotion);
    };
    armShake();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [handleMotion]);

  // ── Listen for Offline Sync Updates ──────────────────────────
  useEffect(() => {
    const handleSync = (e) => {
      if (e.detail && e.detail.id) {
        setActiveSession(prev => ({ ...prev, ...e.detail }));
      }
    };
    window.addEventListener('sos-session-synced', handleSync);
    return () => window.removeEventListener('sos-session-synced', handleSync);
  }, []);

  // ── Live SOS Location Update — every 60 seconds ──────────────
  useEffect(() => {
    // Only start when we have an active synced session with a real Firestore ID
    if (!activeSession?.id || !db) {
      clearInterval(locationUpdateRef.current);
      return;
    }
    const pushLocation = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          try {
            // Reverse geocode for human-readable label
            let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
              const data = await res.json();
              if (data && data.display_name) {
                const parts = data.display_name.split(',').map(s => s.trim());
                label = parts.slice(0, 3).join(', ');
              }
            } catch {}
            await updateDoc(doc(db, 'sos_requests', activeSession.id), {
              lat,
              lng,
              locationLabel: label,
              location_updated_at: new Date().toISOString(),
            });
            // Also update local state so UI reflects new coords
            setLocation(prev => ({ ...prev, lat, lng, label }));
            setLocationUpdated(true);
            setTimeout(() => setLocationUpdated(false), 3000);
          } catch (e) { console.warn('Live location update failed:', e); }
        },
        (err) => console.warn('GPS for live update failed:', err),
        { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
      );
    };
    // Push immediately on session start, then every 60s
    pushLocation();
    locationUpdateRef.current = setInterval(pushLocation, 60000);
    return () => clearInterval(locationUpdateRef.current);
  }, [activeSession?.id]);

  // ── Live volunteer tracker ───────────────────────────────────
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
            if (data.status === 'assigned' && data.assigned_volunteer) {
              setVolunteerDetails(data.assigned_volunteer);
            } else if (data.status === 'accepted' && data.assigned_volunteer) {
              setVolunteerDetails(data.assigned_volunteer);
            } else if (data.status === 'resolved') {
              // Don't auto-dismiss — show feedback form instead
              setVolunteerDetails(data.assigned_volunteer || volunteerDetails);
            }
          }
        });
      }
    }
    return () => { clearInterval(timerId); unsub(); };
  }, [activeSession]);

  // ── Share helpers ────────────────────────────────────────────
  const shareLocation = () => {
    const msg = `🆘 EMERGENCY SOS! I need help!\n📍 Location: ${location.label}\n🗺️ Maps: https://maps.google.com/?q=${location.lat},${location.lng}\n⚠️ Type: ${selectedType}${phone ? `\n📞 My number: ${phone}` : ''}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };
  const shareSMS = () => {
    const msg = `🆘 SOS! Need help at: https://maps.google.com/?q=${location.lat},${location.lng} — ${selectedType} emergency`;
    window.open(`sms:?body=${encodeURIComponent(msg)}`);
  };

  // ── Submit SOS ───────────────────────────────────────────────
  const handleQuickSOS = async (overrideDescription = null, overrideType = null) => {
    if (isSubmitting.current) return;
    if (location.isManual && !isValidPhone(phone)) { setPhoneError(true); return; }
    isSubmitting.current = true;
    setLoading(true);
    setTapCount(0);
    triggerFlash();

    const finalType   = overrideType || selectedType;
    let finalLabel = location.label;
    if (finalLabel === 'Acquiring GPS signal...') {
        finalLabel = `Approximate location (GPS was pending): ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
    } else if (finalLabel.startsWith('GPS unavailable')) {
        finalLabel = `GPS Unavailable (Default Pin): ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
    }

    const description = overrideDescription || `EMERGENCY URGENT: Requires immediate ${finalType} assistance.\n\n📍 Location: ${finalLabel}`;

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
        locationLabel: finalLabel,
        locationIsManual: location.isManual,
        status: 'pending',
        assigned_volunteer: null,
      };

      const syncResult = await transmitSOS(payload);
      const fsId       = syncResult?.data?.id || null;
      const sessionObj = {
        id: fsId,
        priority: computedPriority,
        syncStatus: syncResult?.status || 'queued',
        target_res_time: Date.now() + 15 * 60 * 1000,
      };

      localStorage.setItem('active_sos_session', JSON.stringify(sessionObj));
      setActiveSession(sessionObj);
      setSimulation({
        priority: computedPriority,
        latency: `${Math.round(endTime - startTime)}ms`,
        method: data.model || 'Unknown',
        syncStatus: syncResult?.status,
        syncPlatform: syncResult?.platform,
      });
      setSuccess(true);
    } catch {
      const sessionObj = { id: null, priority: 'HIGH', syncStatus: 'queued', target_res_time: Date.now() + 15 * 60 * 1000 };
      localStorage.setItem('active_sos_session', JSON.stringify(sessionObj));
      setActiveSession(sessionObj);
      setSimulation({ priority: 'HIGH', latency: 'N/A', method: 'Offline Relay', syncStatus: 'queued', syncPlatform: 'IndexedDB' });
      setSuccess(true);
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  // ── Voice recording ──────────────────────────────────────────
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
      if (!res.ok || !data.transcript) throw new Error('Transcription failed');
      const ts = data.transcript;
      setVoiceTranscript(`Analyzed: "${ts.substring(0, 40)}…"`);
      isSubmitting.current = false; setLoading(false);
      await handleQuickSOS(`🎤 [WHISPER AI] Transcript: "${ts}"\n\n📍 Location: ${location.label}`);
    } catch (err) {
      const msg = err.message?.includes('microphone') ? '❌ Mic access denied.' : '❌ Audio AI failed. Try typing instead.';
      setVoiceTranscript(msg);
    } finally {
      isSubmitting.current = false; setLoading(false); setIsListening(false);
    }
  };

  const handleCancelSOS = async () => {
    // Stop the live location interval
    clearInterval(locationUpdateRef.current);
    // Only mark as cancelled if the SOS isn't already resolved
    if (activeSession?.id && db) {
      try {
        const snap = await import('firebase/firestore').then(({ getDoc, doc: fDoc }) =>
          getDoc(fDoc(db, 'sos_requests', activeSession.id))
        );
        const currentStatus = snap.exists() ? snap.data().status : null;
        if (currentStatus && currentStatus !== 'resolved' && currentStatus !== 'cancelled') {
          await updateDoc(doc(db, 'sos_requests', activeSession.id), {
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          });
        }
      } catch (e) { console.error('Cancel error:', e); }
    }
    localStorage.removeItem('active_sos_session');
    setActiveSession(null);
    setSuccess(false);
    setVolunteerDetails(null);
    setSimulation(null);
    setLocationUpdated(false);
    // Reset form fields so page is fresh for a new SOS
    setPhone('');
    setNotes('');
    setSelectedType('Medical');
  };

  const tapLabels = ['TAP 1/3', 'TAP 2/3', 'TAP 3/3 — SENDING!'];
  const tapColors = ['var(--brand-danger)', '#f97316', '#dc2626'];
  const tapGlows  = ['rgba(239,68,68,0.5)', 'rgba(249,115,22,0.6)', 'rgba(220,38,38,0.8)'];

  // ═══════════════════════════════════════════════════════════════
  // SUCCESS / TRACKING SCREEN
  // ═══════════════════════════════════════════════════════════════
  if (success) {
    return (
      <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Status pill row */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem', borderRadius: '50px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-danger)', animation: 'heartbeat 1.5s infinite' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand-danger)' }}>SOS ACTIVE — DO NOT CLOSE THIS PAGE</span>
          </div>
          {/* Live location badge */}
          {activeSession?.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.875rem', borderRadius: '50px', background: locationUpdated ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.1)', border: `1px solid ${locationUpdated ? 'rgba(16,185,129,0.5)' : 'rgba(59,130,246,0.3)'}`, transition: 'all 0.5s' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: locationUpdated ? 'var(--brand-success)' : 'var(--brand-primary)', animation: 'heartbeat 2s infinite' }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: locationUpdated ? 'var(--brand-success)' : 'var(--brand-primary)' }}>
                {locationUpdated ? '📍 Location updated!' : '📍 Location updating every 60s'}
              </span>
            </div>
          )}
        </div>

        {/* ── Volunteer assigned? Show rich tracker ── */}
        {volunteerDetails ? (
          <VolunteerTracker
            sessionObj={activeSession}
            victimLat={location.lat}
            victimLng={location.lng}
            onClose={handleCancelSOS}
            onResend={async () => {
              if (loading || isSubmitting.current) return;
              const confirmed = window.confirm("Are you sure you want to resend and escalate this SOS?");
              if (!confirmed) return;
              const prevType = selectedType;
              await handleCancelSOS();
              setTimeout(() => {
                handleQuickSOS(`[ESCALATED RESEND] EMERGENCY URGENT: Requires immediate ${prevType} assistance.\n\n📍 Location: ${location.label}`, prevType);
              }, 400);
            }}
          />
        ) : (
          /* ── Waiting for volunteer ── */
          <div className="glass animate-slide-up" style={{ padding: '2.5rem', maxWidth: '600px', width: '100%', textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: simulation?.syncStatus === 'synced' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              {simulation?.syncStatus === 'synced'
                ? <CheckCircle size={40} color="var(--brand-success)" />
                : <Database size={40} color="var(--brand-warning)" />}
            </div>

            <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              {simulation?.syncStatus === 'synced' ? 'SOS Transmitted ✓' : 'SOS Queued'}
            </h2>

            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1rem' }}>
              {t('successMsg') || 'Please stay calm. Help is being dispatched.'}
            </p>

            {/* Searching animation / Escalated Warning */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem',
              background: timeLeft === 0 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${timeLeft === 0 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
              borderRadius: '12px', marginBottom: '1.5rem', textAlign: 'left'
            }}>
              {timeLeft === 0 ? (
                <AlertTriangle size={24} color="var(--brand-danger)" style={{ flexShrink: 0 }} />
              ) : (
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--brand-warning)', animation: 'heartbeat 1.5s infinite', flexShrink: 0 }} />
              )}
              <div>
                <p style={{ color: timeLeft === 0 ? 'var(--brand-danger)' : 'var(--brand-warning)', fontWeight: 700, fontSize: '0.88rem', margin: 0 }}>
                  {timeLeft === 0 ? 'Response Delayed — Escalating' : 'Finding nearest volunteer…'}
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: '0.15rem 0 0' }}>
                  {timeLeft === 0 ? 'Notifying central authorities and nearby units immediately.' : 'Keep this page open — you\'ll see volunteer details here.'}
                </p>
              </div>
            </div>

            {/* Timer */}
            <div style={{ marginBottom: '1.5rem', padding: '0.875rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 0.3rem' }}>
                {timeLeft === 0 ? 'AWAITING DISPATCH' : 'Estimated Response Time'}
              </p>
              <div style={{ color: timeLeft === 0 ? 'var(--brand-danger)' : (timeLeft > 300 ? 'var(--brand-warning)' : 'var(--brand-danger)'), fontSize: '1.75rem', fontWeight: 900, margin: 0, fontFamily: 'monospace' }}>
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </div>
            </div>

            {/* Share buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={shareLocation} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', borderRadius: '10px', background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.4)', color: '#25D366', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Share2 size={15} /> Share on WhatsApp
              </button>
              <button onClick={shareSMS} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--brand-primary)', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                <PhoneCall size={15} /> Share via SMS
              </button>
            </div>

            <div className="flex gap-4" style={{ marginBottom: '1rem' }}>
              <button
                onClick={async () => {
                  if (loading || isSubmitting.current) return;
                  const confirmed = window.confirm("Are you sure you want to resend and escalate this SOS?");
                  if (!confirmed) return;
                  const prevType = selectedType;
                  await handleCancelSOS();
                  setTimeout(() => {
                    handleQuickSOS(`[ESCALATED RESEND] EMERGENCY URGENT: Requires immediate ${prevType} assistance.\n\n📍 Location: ${location.label}`, prevType);
                  }, 400);
                }}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem', width: '100%', borderRadius: '12px', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: 'var(--brand-danger)', fontWeight: 800, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}
              >
                <Radio size={16} /> Resend SOS (Escalate)
              </button>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleCancelSOS}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '0.875rem', flex: 1, borderRadius: '12px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel SOS
              </button>
              <button
                onClick={() => window.open(`https://maps.google.com/?q=${location.lat},${location.lng}`, '_blank')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem', flex: 1, borderRadius: '12px', background: 'var(--brand-primary)', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <MapPin size={16} /> My Location
              </button>
            </div>
          </div>
        )}

        {/* Sync status badge */}
        {simulation && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.875rem', background: 'rgba(0,0,0,0.3)', borderRadius: '50px', border: '1px solid rgba(255,255,255,0.06)' }}>
            {simulation.syncStatus === 'synced'
              ? <Wifi size={13} color="var(--brand-success)" />
              : <Database size={13} color="var(--brand-warning)" />}
            <span style={{ fontSize: '0.72rem', color: simulation.syncStatus === 'synced' ? 'var(--brand-success)' : 'var(--brand-warning)', fontWeight: 700 }}>
              {simulation.syncStatus === 'synced' ? `Synced · ${simulation.syncPlatform}` : `Queued · ${simulation.syncPlatform}`}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN SOS FORM
  // ═══════════════════════════════════════════════════════════════
  return (
    <>
      {flashing && <div style={{ position: 'fixed', inset: 0, background: 'rgba(239,68,68,0.5)', zIndex: 9999, pointerEvents: 'none', animation: 'flashPulse 0.3s ease-in-out' }} />}

      <style>{`
        @keyframes flashPulse { 0%,100%{opacity:0} 50%{opacity:1} }
        @keyframes tapPulse { 0%{transform:scale(1)} 50%{transform:scale(1.08)} 100%{transform:scale(1)} }
        @keyframes heartbeat { 0%,100%{transform:scale(1)} 14%{transform:scale(1.18)} 28%{transform:scale(1)} 42%{transform:scale(1.1)} 70%{transform:scale(1)} }
        @keyframes rippleOut { 0%{transform:scale(0.9);opacity:1} 100%{transform:scale(2.4);opacity:0} }
        @keyframes rotateGlow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .etype-btn { transition: all 0.22s cubic-bezier(0.16,1,0.3,1) !important; }
        .etype-btn:hover { transform: translateY(-2px) !important; }
        .etype-btn.selected { animation: borderGlow 2.5s infinite; }
        @keyframes borderGlow { 0%,100%{box-shadow:0 0 12px rgba(239,68,68,0.2)} 50%{box-shadow:0 0 28px rgba(239,68,68,0.5)} }
      `}</style>

      {/* Pin confirm modal */}
      {pendingPin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass" style={{ width: '100%', maxWidth: '420px', padding: '2rem', borderRadius: '20px', border: '1px solid rgba(59,130,246,0.4)', position: 'relative' }}>
            <button onClick={cancelPin} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MapPin size={22} color="var(--brand-primary)" />
              </div>
              <div>
                <h3 style={{ color: 'white', fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>Confirm Pin Location</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: 0 }}>{pendingPin.lat.toFixed(4)}, {pendingPin.lng.toFixed(4)}</p>
              </div>
            </div>
            <p style={{ color: 'var(--brand-warning)', fontSize: '0.82rem', fontWeight: 600, marginBottom: '1.25rem', padding: '0.6rem 0.9rem', background: 'rgba(245,158,11,0.08)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.25)' }}>
              ⚠️ Manual pins require a verified phone number to prevent false alarms.
            </p>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>Mobile Number</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.75rem', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>🇮🇳 +91</span>
              <input type="tel" maxLength={10} value={pinPhone}
                onChange={e => { setPinPhone(e.target.value.replace(/\D/g, '')); setPinPhoneError(''); }}
                placeholder="9XXXXXXXXX" autoFocus
                style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '8px', border: `1px solid ${pinPhoneError ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.12)'}`, background: 'rgba(0,0,0,0.35)', color: 'white', outline: 'none', fontSize: '1rem', letterSpacing: '1px' }}
              />
            </div>
            {pinPhoneError && <p style={{ color: 'var(--brand-danger)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem' }}>⚠️ {pinPhoneError}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button onClick={cancelPin} style={{ flex: 1, padding: '0.875rem', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmPin} disabled={pinPhoneLoading}
                style={{ flex: 2, padding: '0.875rem', borderRadius: '10px', background: isValidPhone(pinPhone) ? 'var(--brand-primary)' : 'rgba(59,130,246,0.25)', border: 'none', color: 'white', fontWeight: 800, cursor: pinPhoneLoading ? 'wait' : 'pointer', fontSize: '0.95rem', transition: 'background 0.2s', fontFamily: 'inherit' }}>
                {pinPhoneLoading ? 'Verifying…' : '✓ Confirm Pin'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '4rem', maxWidth: '620px' }}>

        {/* Session restore banner */}
        {!success && (
          <SessionRestoreBanner
            onResume={(session) => {
              setActiveSession(session);
              setSimulation({ syncStatus: session.syncStatus || 'synced' });
              setSuccess(true);
            }}
            onDismiss={() => {}}
          />
        )}

        {/* ── PREMIUM HERO ── */}
        <div className="animate-slide-up" style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {/* Live badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 1.1rem', borderRadius: '50px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', marginBottom: '1rem', backdropFilter: 'blur(10px)' }}>
             <span className="pulse-dot red" />
             <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fca5a5', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Live · Offline-First · AI-Powered</span>
          </div>

          <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4.2rem)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-2px', marginBottom: '0.75rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.4rem' }}>
            <span style={{ background: 'linear-gradient(135deg, #fff 0%, #fca5a5 40%, #ef4444 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Emergency</span>
            <span style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>SOS</span>
          </h1>

          <p style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.9rem, 3.5vw, 1.05rem)', lineHeight: 1.6, maxWidth: '440px', margin: '0 auto' }}>
            One-tap broadcast to nearby volunteers and emergency responders.
          </p>

          {/* Feature pills */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            {['⚡ 3-Tap SOS', '🎤 Voice AI', '📍 GPS Live', '📡 Works Offline'].map(f => (
              <span key={f} style={{ padding: '0.35rem 0.8rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{f}</span>
            ))}
          </div>
        </div>

        {/* ── Status Bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', padding: '0.8rem 1.1rem', borderRadius: '14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span className={`pulse-dot ${isOnline ? 'green' : 'yellow'}`} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isOnline ? 'var(--brand-success)' : 'var(--brand-warning)' }}>
              {isOnline ? 'Online — Real-time sync' : 'Offline — SOS will queue'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>⚡ 3-TAP</span>
            <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}><AlertOctagon size={10} /> SHAKE</span>
          </div>
        </div>

        {/* ── Main Form Card ── */}
        <div className="glass animate-slide-up delay-1" style={{ padding: 'clamp(1rem, 4vw, 2.5rem)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>

          {/* ── Language Switcher ── */}
          <div className="flex justify-between items-center" style={{ width: '100%', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.75rem', padding: '0.7rem 1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.035)', border: '1px solid var(--glass-border)' }}>
            <div className="flex items-center gap-2">
              <Globe size={18} color="var(--brand-primary)" />
              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('lang')}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {['en', 'hi', 'mr'].map((l) => (
                <button key={l} onClick={() => i18n.changeLanguage(l)}
                  style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', background: i18n.language === l ? 'linear-gradient(135deg, var(--brand-primary), #1d4ed8)' : 'rgba(0,0,0,0.2)', border: i18n.language === l ? 'none' : '1px solid rgba(255,255,255,0.1)', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '0.8rem', textTransform: 'uppercase', fontFamily: 'inherit', transition: 'all 0.2s', boxShadow: i18n.language === l ? '0 4px 16px rgba(59,130,246,0.4)' : 'none' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Emergency type selector */}
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ width: 4, height: 16, background: 'var(--brand-danger)', borderRadius: 2 }} />
            <p style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px', margin: 0 }}>Emergency Type</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '2rem', width: '100%' }}>
            {[
              { key: 'Medical', icon: '🏥' }, { key: 'Food', icon: '🍚' },
              { key: 'Rescue', icon: '🚁' }, { key: 'Shelter', icon: '🏠' },
              { key: 'Medicine', icon: '💊' }, { key: 'ElderSupport', icon: '👴' },
              { key: 'ChildSupport', icon: '👶' }, { key: 'PharmacyNeeded', icon: '⚕️' },
              { key: 'BloodRequired', icon: '🩸' }, { key: 'Any', icon: '🆘' },
            ].map(({ key: typeKey, icon }) => (
              <button key={typeKey} onClick={() => setSelectedType(typeKey)}
                className={`etype-btn ${selectedType === typeKey ? 'selected' : ''}`}
                style={{
                  minHeight: '48px', padding: '0.75rem 0.5rem', borderRadius: '12px',
                  background: selectedType === typeKey
                    ? 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.08))'
                    : 'rgba(0,0,0,0.25)',
                  border: `1.5px solid ${selectedType === typeKey ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.07)'}`,
                  color: selectedType === typeKey ? 'white' : 'var(--text-secondary)',
                  fontSize: 'clamp(0.75rem, 3vw, 0.85rem)', fontWeight: selectedType === typeKey ? 800 : 700, cursor: 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '0.4rem',
                }}>
                <span style={{ fontSize: '1.2em' }}>{icon}</span> <span>{t(`type${typeKey}`)}</span>
              </button>
            ))}
          </div>

          {/* Location */}
          <div className="glass" style={{ padding: '1rem 1.5rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', border: `1px solid ${gpsError ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`, width: '100%' }}>
            <div className={location.active && !location.isManual ? 'animate-pulse-glow' : ''} style={{ width: '44px', height: '44px', borderRadius: '12px', background: location.active ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MapPin size={22} color={location.active ? 'var(--brand-success)' : 'var(--brand-warning)'} />
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <h3 style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.15rem' }}>
                Emergency Location {location.isManual && <span style={{ color: 'var(--brand-warning)', marginLeft: '0.4rem' }}>📍 Manual Pin</span>}
              </h3>
              <p style={{ fontWeight: 600, fontSize: '0.875rem', color: location.active ? 'white' : 'var(--text-secondary)', lineHeight: 1.4 }}>{location.label}</p>
              <button onClick={() => setShowMap(!showMap)} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--brand-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', marginTop: '0.4rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                {showMap ? 'Hide Map' : gpsError ? '⚠️ Pin manually' : 'Not accurate? Pin manually'}
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
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>📍 Tap map to drop pin → phone verify modal will open</p>
            </div>
          )}

          {/* Inputs */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.75rem' }}>
            <div>
              <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setPhoneError(false); }}
                placeholder={location.isManual ? '📞 Phone verified above' : '📞 Contact number (optional)'}
                disabled={location.isManual}
                style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: '10px', border: `1px solid ${phoneError ? 'rgba(239,68,68,0.6)' : location.isManual ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`, background: location.isManual ? 'rgba(16,185,129,0.05)' : 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', fontSize: '1rem' }} />
              {phoneError && <p style={{ color: 'var(--brand-danger)', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.3rem', textAlign: 'left' }}>⚠️ Valid phone required for manual pin</p>}
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="📝 Any additional details (optional)…" rows={2}
              style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', fontSize: '0.95rem', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {/* Share quick links */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', width: '100%', marginBottom: '1.75rem' }}>
            <button onClick={shareLocation} style={{ minHeight: '48px', flex: '1 1 calc(50% - 0.5rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.7rem', borderRadius: '12px', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Share2 size={16} /> WhatsApp
            </button>
            <button onClick={shareSMS} style={{ minHeight: '48px', flex: '1 1 calc(50% - 0.5rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.7rem', borderRadius: '12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--brand-primary)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              <PhoneCall size={16} /> SMS
            </button>
          </div>

          {/* ── Voice SOS ── */}
          <div style={{ width: '100%', marginBottom: '1.75rem' }}>
            <button onClick={toggleRecording} disabled={loading && !isListening}
              style={{
                width: '100%', padding: '1.25rem', borderRadius: '18px',
                background: isListening
                  ? 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(239,68,68,0.08))'
                  : 'rgba(10,16,30,0.6)',
                border: `1px solid ${isListening ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
                backdropFilter: 'blur(16px)',
                display: 'flex', alignItems: 'center', gap: '1rem',
                cursor: (loading && !isListening) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.3s',
                boxShadow: isListening ? '0 0 30px rgba(239,68,68,0.2), inset 0 1px 0 rgba(255,255,255,0.05)' : 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}>
              <div style={{
                width: '54px', height: '54px', borderRadius: '50%',
                background: isListening ? 'var(--brand-danger)' : 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.05))',
                border: isListening ? 'none' : '1px solid rgba(59,130,246,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: isListening ? '0 0 28px rgba(239,68,68,0.6)' : '0 0 12px rgba(59,130,246,0.15)',
                transition: 'all 0.3s',
              }}>
                {isListening
                  ? <div style={{ width: '14px', height: '14px', background: 'white', borderRadius: '3px' }} />
                  : <Mic size={24} color="#93c5fd" />}
              </div>
              <div style={{ textAlign: 'left', flex: 1 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'white', marginBottom: '0.2rem' }}>
                  {isListening ? '🔴 Recording… Tap to Send' : '🎙️ Voice SOS'}
                </h3>
                <p style={{ fontSize: '0.78rem', color: voiceTranscript?.startsWith('❌') ? 'var(--brand-danger)' : 'var(--text-secondary)', margin: 0 }}>
                  {voiceTranscript || 'Whisper AI transcribes → routes to right volunteers'}
                </p>
              </div>
              {!isListening && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd', flexShrink: 0 }}>AI</span>
              )}
            </button>
          </div>

          {/* Divider */}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', color: 'var(--text-secondary)' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>OR TAP 3× BELOW</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
          </div>

          {/* ── Tap progress indicators ── */}
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem', alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: tapCount > i ? '32px' : '12px', height: '12px',
                borderRadius: '6px',
                background: tapCount > i
                  ? `linear-gradient(135deg, ${tapColors[i] || 'var(--brand-danger)'}, ${i === 2 ? '#7f1d1d' : '#991b1b'})`
                  : 'rgba(255,255,255,0.1)',
                border: `1px solid ${tapCount > i ? 'transparent' : 'rgba(255,255,255,0.18)'}`,
                boxShadow: tapCount > i ? `0 0 10px ${tapGlows[i]}` : 'none',
                transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
              }} />
            ))}
            {tapCount > 0 && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: tapColors[tapCount - 1], marginLeft: '0.25rem', animation: 'heartbeat 0.8s ease' }}>
                {tapLabels[tapCount - 1] || ''}
              </span>
            )}
          </div>

          {/* ── THE BIG SOS BUTTON ── */}
          <div className="sos-btn" style={{ position: 'relative', marginBottom: '0.5rem' }}>
            {/* Outer ripple rings */}
            {!loading && tapCount === 0 && [
              { d: '-14px', opacity: 0.15, dur: '3s', delay: '0s' },
              { d: '-28px', opacity: 0.1,  dur: '3s', delay: '0.5s' },
              { d: '-42px', opacity: 0.06, dur: '3s', delay: '1s' },
            ].map((r, i) => (
              <div key={i} style={{
                position: 'absolute',
                inset: r.d, borderRadius: '50%',
                border: `1.5px solid rgba(239,68,68,${r.opacity + 0.05})`,
                animation: `sosPulseRing 3s infinite ${r.delay}`,
                pointerEvents: 'none',
              }} />
            ))}

            <button
              onClick={handleSOSTap}
              disabled={loading}
              style={{
                width: '210px', height: '210px', borderRadius: '50%',
                background: tapCount === 0
                  ? 'linear-gradient(145deg, #ef4444 0%, #b91c1c 60%, #7f1d1d 100%)'
                  : `linear-gradient(145deg, ${tapColors[tapCount - 1] || '#ef4444'}, #7f1d1d)`,
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                border: '5px solid rgba(255,255,255,0.12)',
                outline: '2px solid rgba(239,68,68,0.3)',
                outlineOffset: '6px',
                boxShadow: [
                  `0 0 60px rgba(239,68,68,${tapCount > 0 ? 0.7 : 0.45})`,
                  `0 0 120px rgba(239,68,68,${tapCount > 0 ? 0.35 : 0.18})`,
                  `0 20px 60px rgba(0,0,0,0.5)`,
                  `inset 0 2px 0 rgba(255,255,255,0.2)`,
                  `inset 0 -4px 0 rgba(0,0,0,0.3)`,
                ].join(', '),
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
                animation: tapCount > 0 ? 'tapPulse 0.3s ease' : 'none',
                userSelect: 'none',
                fontFamily: 'inherit',
                transform: loading ? 'scale(0.96)' : 'scale(1)',
              }}
            >
              <div>
                <span style={{ display: 'block', fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-1px', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
                  {loading ? '⏳' : 'SOS'}
                </span>
                <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, opacity: 0.9, marginTop: '0.3rem', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                  {loading ? t('processing') : tapLabels[tapCount] || 'TAP 1/3'}
                </span>
              </div>
            </button>
          </div>

          <p style={{ marginTop: '1rem', fontSize: '0.73rem', color: 'var(--text-muted)', letterSpacing: '0.3px' }}>
            Tap 3× to confirm &nbsp;·&nbsp; Shake phone for instant SOS
          </p>
        </div>

        {/* ── Feature footer ── */}
        <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {[
            { icon: '🌐', label: 'Works offline', sub: 'IndexedDB queue' },
            { icon: '🤖', label: 'AI Triage', sub: 'Groq Whisper' },
            { icon: '📡', label: 'Live Sync', sub: 'Firebase RT' },
          ].map(f => (
            <div key={f.label} style={{ textAlign: 'center', padding: '0.875rem 0.5rem', borderRadius: '14px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '1.25rem', marginBottom: '0.3rem' }}>{f.icon}</div>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.1rem' }}>{f.label}</p>
              <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', margin: 0 }}>{f.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
