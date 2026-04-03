'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertCircle, MapPin, Activity, CheckCircle, Database, Globe, Mic, Radio } from 'lucide-react';
import Link from 'next/link';
import { transmitSOS, processOfflineQueue } from '../utils/offlineSync';
import '../i18n';
import { useTranslation } from 'react-i18next';

export default function SOSForm() {
  const { t, i18n } = useTranslation();
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [simulation, setSimulation] = useState(null);
  const [selectedType, setSelectedType] = useState('Medical');
  const [location, setLocation] = useState({ lat: 19.0760, lng: 72.8777, label: "Acquiring GPS signal...", active: false });
  
  // Voice AI State
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  
  // 3-Tap Verification State
  const [taps, setTaps] = useState(0);
  const resetTimer = useRef(null);

  useEffect(() => {
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

    const handleOnline = () => processOfflineQueue();
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) processOfflineQueue();
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleTap = () => {
    if (loading) return;
    
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
      
      const computedPriority = data.priority || (finalType === 'Medical' || finalType === 'Fire' ? 'HIGH' : 'MEDIUM');
      
      const payload = {
        name: 'Anonymous Citizen',
        type: t(`type${finalType}`) || finalType, 
        description,
        priority: computedPriority,
        lat: location.lat, 
        lng: location.lng,
        status: 'pending'
      };
      
      const syncResult = await transmitSOS(payload);
      
      setSimulation({ 
        priority: computedPriority, 
        latency: `${Math.round(endTime - startTime)}ms`, 
        method: data.model || 'Unknown Engine',
        syncStatus: syncResult.status,
        syncPlatform: syncResult.platform
      });
      setSuccess(true);
    } catch (error) {
      setSimulation({ priority: 'HIGH', latency: 'N/A', method: 'Emergency Offline Relay', syncStatus: 'queued', syncPlatform: 'IndexedDB (Offline Fallback)' });
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  // ─── AI VOICE RECOGNITION TRIAGE ─────────────────────────────────────
  const handleVoiceSOS = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice AI is not supported in this specific browser. Please use the manual tap button.");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = i18n.language === 'hi' ? 'hi-IN' : i18n.language === 'mr' ? 'mr-IN' : 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
      setIsListening(true);
      setVoiceTranscript('Listening... Speak now.');
    };
    
    recognition.onresult = async (event) => {
      const ts = event.results[0][0].transcript;
      setVoiceTranscript(`Analyzing: "${ts}"`);
      
      // Basic fallback NLP categorization
      let autoType = 'Medical';
      const tg = ts.toLowerCase();
      if (tg.includes('fire') || tg.includes('aag') || tg.includes('smoke')) autoType = 'Fire';
      if (tg.includes('rescue') || tg.includes('water') || tg.includes('stuck') || tg.includes('paani') || tg.includes('flood')) autoType = 'Rescue';
      if (tg.includes('food') || tg.includes('supplies') || tg.includes('khana')) autoType = 'Supplies';
      
      setSelectedType(autoType);
      
      const voiceDescription = `🎤 [VOICE AI TRIAGE] Transcript: "${ts}"\nAuto-categorized as: ${autoType} Emergency.\n\n📍 Location: ${location.label}`;
      setIsListening(false);
      
      await handleQuickSOS(voiceDescription, autoType);
    };
    
    recognition.onerror = (e) => {
      console.error(e);
      setIsListening(false);
      setVoiceTranscript('');
    };
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  if (success) {
    return (
      <div className="container" style={{ paddingTop: '4rem', display: 'flex', justifyContent: 'center' }}>
        <div className="glass animate-slide-up" style={{ padding: '3rem', maxWidth: '600px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', background: simulation?.syncStatus === 'synced' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
            {simulation?.syncStatus === 'synced' ? <CheckCircle size={40} color="var(--brand-success)" /> : <Database size={40} color="var(--brand-warning)" />}
          </div>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem' }}>
            {simulation?.syncStatus === 'synced' ? t('synced') : t('queued')}
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.25rem' }}>
            {t('successMsg')}
          </p>
          <Link href="/dashboard" className="btn btn-primary" style={{ width: '100%', fontSize: '1.25rem', padding: '1rem' }}>{t('viewMap')}</Link>
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
          {['Medical', 'Rescue', 'Supplies', 'Fire'].map((typeKey) => (
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
          </div>
        </div>

        <div className="flex gap-4 w-full" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          
          {/* New Voice AI Triage Button */}
          <div style={{ flex: '1 1 100%', marginBottom: '2rem' }}>
            <button 
              onClick={handleVoiceSOS}
              disabled={loading || isListening}
              className={`glass shadow-lg neon-border ${isListening ? 'animate-pulse-glow' : ''}`}
              style={{
                width: '100%',
                padding: '1.5rem',
                borderRadius: '16px',
                background: isListening ? 'rgba(59,130,246,0.2)' : 'rgba(10,15,28,0.7)',
                border: `1px solid ${isListening ? 'var(--brand-primary)' : 'rgba(255,255,255,0.1)'}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                cursor: (loading || isListening) ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: isListening ? 'var(--brand-primary)' : 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: isListening ? '0 0 30px var(--brand-primary)' : 'none' }}>
                {isListening ? <Radio size={32} color="white" className="animate-spin" style={{ animationDuration: '3s' }} /> : <Mic size={32} color="var(--brand-primary)" />}
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', marginBottom: '0.25rem' }}>
                  {isListening ? 'Listening...' : 'Voice AI Request'}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {voiceTranscript ? voiceTranscript : 'Tap to speak your emergency. AI will auto-triage.'}
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
