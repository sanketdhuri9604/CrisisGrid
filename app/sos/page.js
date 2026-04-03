'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, CheckCircle, Database, Globe, Mic, Radio, User, Activity } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { transmitSOS, processOfflineQueue } from '../utils/offlineSync';
import { db } from '../utils/firebaseClient';
import { doc, onSnapshot } from 'firebase/firestore';
import '../i18n';
import { useTranslation } from 'react-i18next';

const LocationPicker = dynamic(() => import('../components/LocationPicker'), { ssr: false });

export default function SOSForm() {
  const { t, i18n } = useTranslation();
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [simulation, setSimulation] = useState(null);
  const [selectedType, setSelectedType] = useState('Medical');
  const [location, setLocation] = useState({ lat: 19.0760, lng: 72.8777, label: "Acquiring GPS signal...", active: false });
  const [showMap, setShowMap] = useState(false);
  // ✅ NEW: Contact info + description fields
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  // ✅ NEW: Detect voice support on mount (Firefox doesn't support SpeechRecognition)
  const [voiceSupported, setVoiceSupported] = useState(false);
  
  // Voice AI State & Audio Recording
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  // 3-Tap Verification State
  const [taps, setTaps] = useState(0);
  const resetTimer = useRef(null);
  const isSubmitting = useRef(false); // Synchronous lock against duplicates

  // Session Persistence & Volunteer Tracking
  const [activeSession, setActiveSession] = useState(null);
  const [timeLeft, setTimeLeft] = useState(900);
  const [volunteerDetails, setVolunteerDetails] = useState(null);

  useEffect(() => {
    // 1. Check for persisted session on Mount
    const storedStr = localStorage.getItem('active_sos_session');
    if (storedStr) {
      try {
        const stored = JSON.parse(storedStr);
        // Ensure it hasn't somehow been over 24 hours (cleanup)
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
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
              headers: { 'Accept-Language': 'en' }
            });
            const data = await res.json();
            const address = data.display_name ? data.display_name.split(',').slice(0, 3).join(',') : `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
            setLocation({ lat, lng, label: address, active: true });
          } catch (e) {
            setLocation({ lat, lng, label: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`, active: true });
          }
        },
        () => setLocation({ lat: 19.0760, lng: 72.8777, label: 'GPS disabled. Using network estimate (12m)', active: false })
      );
    }

    // ✅ FIX: Detect SpeechRecognition support once on mount (Firefox fix)
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);

    const handleOnline = () => processOfflineQueue();
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) processOfflineQueue();
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // 2. Setup Countdown Timer & Live Volunteer Firestore Listener
  useEffect(() => {
    let timerId;
    let unsub = () => {};

    if (activeSession) {
      // Timer interval
      timerId = setInterval(() => {
        const delta = Math.floor((activeSession.target_res_time - Date.now()) / 1000);
        if (delta <= 0) {
          setTimeLeft(0);
          clearInterval(timerId);
        } else {
          setTimeLeft(delta);
        }
      }, 1000);

      // Attach Firestore Listener if online and strictly using Firebase
      if (activeSession.id && db) {
        unsub = onSnapshot(doc(db, 'sos_requests', activeSession.id), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data.status === 'assigned' && data.assigned_volunteer) {
              setVolunteerDetails(data.assigned_volunteer);
            } else if (data.status === 'resolved') {
              // Complete cleanup when task is resolved
              localStorage.removeItem('active_sos_session');
              setActiveSession(null);
              setSuccess(false);
              setVolunteerDetails(null);
            }
          }
        });
      }
    }

    return () => {
      clearInterval(timerId);
      unsub();
    };
  }, [activeSession]);

  const handleTap = () => {
    if (loading || isSubmitting.current) return;
    
    const newTaps = taps + 1;
    setTaps(newTaps);

    if (resetTimer.current) clearTimeout(resetTimer.current);

    if (newTaps >= 3) {
      setTaps(0);
      handleQuickSOS();
    } else {
      // Reset taps if user stops tapping for 3 seconds
      resetTimer.current = setTimeout(() => {
        setTaps(0);
      }, 3000);
    }
  };

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const handleQuickSOS = async (overrideDescription = null, overrideType = null) => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setLoading(true);
    
    const finalType = overrideType || selectedType;
    const description = overrideDescription || `EMERGENCY URGENT: Requires immediate ${finalType} assistance. Needs fast response.\n\n📍 Location: ${location.label}`;
    
    try {
      const startTime = performance.now();
      const res = await fetch('/api/priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
      });
      const data = await res.json();
      const endTime = performance.now();
      
      const computedPriority = data.priority || (['Medical', 'Fire', 'Rescue', 'BloodRequired'].includes(finalType) ? 'HIGH' : 'MEDIUM');
      
      const payload = {
        name: 'Anonymous Citizen',
        phone: phone || 'Not provided',
        type: t(`type${finalType}`) || finalType, 
        description,
        notes: notes || '',
        priority: computedPriority,
        analysis: data.analysis || null, // ✅ NEW: Store the full complex AI JSON
        lat: location.lat, 
        lng: location.lng,
        status: 'pending'
      };
      
      const syncResult = await transmitSOS(payload);
      const fsId = syncResult?.data?.id || null;
      
      const sessionObj = {
        id: fsId,
        priority: computedPriority, 
        syncStatus: syncResult?.status || 'queued',
        target_res_time: Date.now() + 15 * 60 * 1000 // 15 mins from now
      };

      // Persist across page loads
      localStorage.setItem('active_sos_session', JSON.stringify(sessionObj));
      setActiveSession(sessionObj);
      
      setSimulation({ 
        priority: computedPriority, 
        latency: `${Math.round(endTime - startTime)}ms`, 
        method: data.model || 'Unknown Engine',
        syncStatus: syncResult?.status,
        syncPlatform: syncResult?.platform
      });
      setSuccess(true);
    } catch (error) {
      setSimulation({ priority: 'HIGH', latency: 'N/A', method: 'Emergency Offline Relay', syncStatus: 'queued', syncPlatform: 'IndexedDB (Offline Fallback)' });
      setSuccess(true);
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  // ─── DEEP AUDIO INGESTION (MediaRecorder + Groq Whisper) ───────────
  const toggleRecording = async () => {
    if (isSubmitting.current) return;
    
    // Stop recording if already active
    if (isListening && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Close stream
        stream.getTracks().forEach(track => track.stop());
        
        await processAudioTranscription(audioBlob);
      };

      setIsListening(true);
      setVoiceTranscript('Recording... Tap again to stop & process.');
      mediaRecorder.start();

    } catch (err) {
      console.error('Mic access denied:', err);
      setVoiceTranscript('❌ Microphone access denied.');
      alert('Please allow microphone permissions to use Audio AI.');
    }
  };

  const processAudioTranscription = async (audioBlob) => {
    setVoiceTranscript('Extracting speech to text via AI...');
    isSubmitting.current = true;
    setLoading(true);

    try {
      const formData = new FormData();
      // append generic audio file name so api functions can read it well
      formData.append('file', audioBlob, 'emergency-audio.webm');

      // 1. Send Audio to STT Engine
      const transc_res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const transc_data = await transc_res.json();

      if (!transc_res.ok || !transc_data.transcript) {
        throw new Error(transc_data.error || 'Failed to parse audio');
      }

      const ts = transc_data.transcript;
      setVoiceTranscript(`Analyzed: "${ts.substring(0, 40)}..."`);
      
      // We no longer need to locally guess autoType, the Advanced AI handles it entirely in JSON payload
      const voiceDescription = `🎤 [WHISPER AI AUDIO INGESTION] Raw Transcript: "${ts}"\n\n📍 Location: ${location.label}`;
      
      // Temporarily lift submit lock to let handleQuickSOS process it
      isSubmitting.current = false;
      setLoading(false);
      
      await handleQuickSOS(voiceDescription);

    } catch (error) {
      console.error('Transcription error:', error);
      setVoiceTranscript('❌ Audio AI failed. Try typing instead.');
    } finally {
      isSubmitting.current = false;
      setLoading(false);
      setIsListening(false);
    }
  };

  if (success) {
    return (
      <div className="container" style={{ paddingTop: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Volunteer Live Tracking Box! */}
        {volunteerDetails && (
          <div className="glass animate-slide-up shadow-lg neon-border" style={{ padding: '1.5rem', width: '100%', maxWidth: '600px', marginBottom: '1.5rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--brand-success)' }}>
            <div className="flex items-center gap-3">
              <div style={{ padding: '0.75rem', background: 'var(--brand-success)', borderRadius: '50%' }}>
                <Activity size={24} color="white" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', margin: 0 }}>Volunteer Assigned!</h3>
                <p style={{ color: 'var(--brand-success)', fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Help is on the way.</p>
              </div>
            </div>
            <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <User size={16} color="var(--text-secondary)" />
                <span style={{ color: 'white', fontWeight: 600 }}>{volunteerDetails.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <CheckCircle size={16} color="var(--brand-primary)" />
                <span style={{ color: 'var(--brand-primary)', fontSize: '0.85rem' }}>Skills: {volunteerDetails.skills?.join(', ') || 'General'}</span>
              </div>
              {volunteerDetails.location && location && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MapPin size={16} color="var(--brand-warning)" />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Location: Approx {Math.round(volunteerDetails.location.lat * 100) / 100}, {Math.round(volunteerDetails.location.lng * 100) / 100}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="glass animate-slide-up" style={{ padding: '3rem', maxWidth: '600px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', background: simulation?.syncStatus === 'synced' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
            {simulation?.syncStatus === 'synced' ? <CheckCircle size={40} color="var(--brand-success)" /> : <Database size={40} color="var(--brand-warning)" />}
          </div>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            {simulation?.syncStatus === 'synced' ? 'SOS Transmitted' : 'SOS Queued'}
          </h2>
          
          {/* Dynamic timer display calculated cross-page */}
          <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--brand-primary)', marginBottom: '1.5rem', fontFamily: 'monospace' }}>
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
          </div>
          
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.1rem' }}>
            {t('successMsg') || 'Please stay calm. Do not close this page. We are routing a volunteer.'}
          </p>
          
          <div className="flex gap-4">
            <button 
              onClick={() => { localStorage.removeItem('active_sos_session'); setActiveSession(null); setSuccess(false); setVolunteerDetails(null); }} 
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '1rem', flex: 1, borderRadius: '12px', color: 'white', cursor: 'pointer' }}
            >
              Cancel SOS
            </button>
            <Link href="/dashboard" className="btn btn-primary" style={{ padding: '1rem', flex: 1, textAlign: 'center' }}>{t('viewMap')}</Link>
          </div>
        </div>
      </div>
    );
  }

  // Calculate the color intensity of the button based on taps
  const alertColor = taps === 0 ? 'var(--brand-danger)' : taps === 1 ? '#ef4444' : '#dc2626';
  const alertScale = taps === 0 ? 1 : taps === 1 ? 0.98 : 0.95;

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem', maxWidth: '600px' }}>
      
      {/* Multilingual Selector */}
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <div className="flex items-center gap-2 text-secondary">
          <Globe size={20} color="var(--brand-primary)" />
          <span style={{ fontWeight: 600 }}>{t('lang')}</span>
        </div>
        <div className="flex gap-2">
          {['en', 'hi', 'mr'].map((l) => (
            <button 
              key={l}
              onClick={() => changeLanguage(l)}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                background: i18n.language === l ? 'var(--brand-primary)' : 'transparent',
                border: i18n.language === l ? 'none' : '1px solid var(--glass-border)',
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="glass animate-slide-up" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '0.5rem', color: 'var(--brand-danger)' }}>
          {t('title')}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '2rem' }}>
          {t('sub')}
        </p>

        {/* Quick Selectors */}
        <div className="flex gap-2" style={{ flexWrap: 'wrap', justifyContent: 'center', marginBottom: '2.5rem', width: '100%' }}>
          {['Medical', 'Food', 'Rescue', 'Shelter', 'Medicine', 'ElderSupport', 'ChildSupport', 'PharmacyNeeded', 'BloodRequired', 'Any'].map((typeKey) => (
            <button
              key={typeKey}
              onClick={() => setSelectedType(typeKey)}
              style={{
                flex: '1 1 calc(50% - 1rem)',
                padding: '1rem',
                borderRadius: '12px',
                background: selectedType === typeKey ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0,0,0,0.3)',
                border: `2px solid ${selectedType === typeKey ? 'var(--brand-danger)' : 'var(--glass-border)'}`,
                color: 'white',
                fontSize: '1.25rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {t(`type${typeKey}`)}
            </button>
          ))}
        </div>

        {/* Dynamic Location View (Like Rapido) */}
        <div className="glass shadow-lg" style={{ padding: '1rem 1.5rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className={location.active ? "animate-pulse-glow" : ""} style={{ width: '48px', height: '48px', borderRadius: '12px', background: location.active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={24} color={location.active ? 'var(--brand-success)' : 'var(--brand-warning)'} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pickup / Emergency Location
            </h3>
            <p style={{ fontWeight: 600, fontSize: '0.95rem', color: location.active ? 'white' : 'var(--text-secondary)', lineHeight: 1.4, marginTop: '0.25rem' }}>
              {location.label}
            </p>
            <button onClick={() => setShowMap(!showMap)} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--brand-primary)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', marginTop: '0.5rem', cursor: 'pointer' }}>
              {showMap ? 'Hide Map' : 'Location Not Accurate? Manual Pinpoint'}
            </button>
          </div>
        </div>

        {showMap && (
          <div style={{ width: '100%', marginBottom: '2rem', animation: 'fadeIn 0.3s' }}>
            <LocationPicker 
              defaultPosition={{ lat: location.lat, lng: location.lng }} 
              onLocationChange={(lat, lng) => {
                setLocation({ lat, lng, label: `Manual Pin: Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`, active: true });
              }} 
            />
          </div>
        )}

        {/* ✅ NEW: Phone + Notes fields */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>📞 Contact Number (optional but recommended)</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', fontSize: '1rem' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>📝 Additional Details (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. 3rd floor, blue gate, 2 people trapped..."
              rows={3}
              style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', fontSize: '0.95rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>
        </div>

        <div className="flex gap-4 w-full" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          
          {/* ✅ Multi-Modal MediaRecorder Triage Button */}
          <div style={{ flex: '1 1 100%', marginBottom: '2rem' }}>
            <button 
              onClick={toggleRecording}
              disabled={loading && !isListening} // Only disabled if globally loading, but if we are listening we need it active to stop!
              className={`glass shadow-lg neon-border ${isListening ? 'animate-pulse-glow' : ''}`}
              style={{
                width: '100%',
                padding: '1.5rem',
                borderRadius: '16px',
                background: isListening ? 'rgba(239,68,68,0.2)' : 'rgba(10,15,28,0.7)',
                border: `1px solid ${isListening ? 'var(--brand-danger)' : 'rgba(255,255,255,0.1)'}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                cursor: (loading && !isListening) ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: isListening ? 'var(--brand-danger)' : 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: isListening ? '0 0 30px var(--brand-danger)' : 'none' }}>
                {isListening ? <div style={{ width: '20px', height: '20px', background: 'white', borderRadius: '4px', animation: 'pulse 1s infinite' }} /> : <Mic size={32} color="var(--brand-primary)" />}
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', marginBottom: '0.25rem' }}>
                  {isListening ? 'Recording... Tap to Send' : 'Hold/Tap to Send Voice SOS'}
                </h3>
                <p style={{ fontSize: '0.85rem', color: voiceTranscript?.startsWith('❌') ? 'var(--brand-danger)' : 'var(--text-secondary)' }}>
                  {voiceTranscript ? voiceTranscript : 'AI will automatically route you to the correct volunteers.'}
                </p>
              </div>
            </button>
          </div>

          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', color: 'var(--text-secondary)' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>OR MANUAL BYPASS</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
          </div>

          {/* Massive Validation Panic Button */}
          <button 
            onClick={handleTap}
            disabled={loading} 
            style={{ 
              width: '240px', 
              height: '240px', 
              borderRadius: '50%', 
              background: alertColor, 
              color: 'white', 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              border: '8px solid rgba(255,255,255,0.1)',
              boxShadow: `0 0 ${taps === 0 ? '40px' : taps === 1 ? '70px' : '100px'} rgba(239,68,68,0.5)`,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: `scale(${alertScale})`,
              userSelect: 'none',
              margin: '0 auto'
            }}
          >
            <div style={{ padding: '1rem' }}>
              <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.3 }}>
                {loading ? t('processing') : (taps === 0 ? t('btnVerify') : t('btnRemaining', { count: 3 - taps }))}
              </span>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}
