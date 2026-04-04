'use client';

import { useState, useEffect, useCallback } from 'react';
import { User, Phone, MapPin, CheckCircle, Clock, Star, Navigation, Activity, Shield, Zap } from 'lucide-react';
import { db } from '../utils/firebaseClient';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';

// Calculate ETA: assume 30 km/h average speed in emergency
function calcETA(distKm) {
  if (!distKm || distKm >= 999) return null;
  const mins = Math.ceil((distKm / 30) * 60);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `~${mins} min`;
  return `~${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Journey stages
const STAGES = ['Assigned', 'En Route', 'Arrived'];

function StarRating({ value, onChange, disabled }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="star-rating" style={{ justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className={`star-btn ${star <= (hovered || value) ? 'active' : ''}`}
          onClick={() => !disabled && onChange(star)}
          onMouseEnter={() => !disabled && setHovered(star)}
          onMouseLeave={() => !disabled && setHovered(0)}
          disabled={disabled}
          style={{ cursor: disabled ? 'default' : 'pointer' }}
        >
          ⭐
        </button>
      ))}
    </div>
  );
}

export default function VolunteerTracker({ sessionObj, victimLat, victimLng, onClose, onResend }) {
  const [sosData, setSosData] = useState(null);
  const [stage, setStage] = useState(0); // 0=Assigned, 1=En Route, 2=Arrived
  const [distKm, setDistKm] = useState(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [elapsedSecs, setElapsedSecs] = useState(0);

  const sosId = sessionObj?.id;

  // Live Firestore listener
  useEffect(() => {
    if (!sosId || !db) return;
    const unsub = onSnapshot(doc(db, 'sos_requests', sosId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setSosData(data);

      // Derive stage from status
      if (data.status === 'resolved') setStage(2);
      else if (data.status === 'accepted') {
        // If volunteer is close (<0.5km), consider "Arrived"
        if (data.assigned_volunteer?.location?.lat && victimLat) {
          const d = haversineKm(
            data.assigned_volunteer.location.lat,
            data.assigned_volunteer.location.lng,
            victimLat,
            victimLng
          );
          setDistKm(d);
          setStage(d < 0.5 ? 2 : 1);
        } else {
          setStage(1);
        }
      }
    });
    return () => unsub();
  }, [sosId, victimLat, victimLng]);

  // Elapsed time counter
  useEffect(() => {
    if (!sosData?.accepted_at) return;
    const assigned_at = new Date(sosData.accepted_at).getTime();
    const tick = setInterval(() => {
      const diffSecs = Math.floor((Date.now() - assigned_at) / 1000);
      setElapsedSecs(diffSecs > 0 ? diffSecs : 0);
    }, 1000);
    return () => clearInterval(tick);
  }, [sosData?.accepted_at]);

  const formatElapsed = (secs) => {
    if (secs < 60) return `${secs}s ago`;
    const m = Math.floor(secs / 60);
    return `${m} min ago`;
  };

  const handleFeedback = useCallback(async () => {
    if (!rating || !sosId || !db) return;
    setSubmittingFeedback(true);
    try {
      await updateDoc(doc(db, 'sos_requests', sosId), {
        feedback: {
          rating,
          comment: comment.trim(),
          submittedAt: new Date().toISOString(),
        },
      });
      setFeedbackSubmitted(true);
    } catch (e) {
      console.error('Feedback error:', e);
    } finally {
      setSubmittingFeedback(false);
    }
  }, [rating, comment, sosId]);

  const volunteer = sosData?.assigned_volunteer;
  const isResolved = sosData?.status === 'resolved';

  if (!volunteer) return null;

  // Initials avatar
  const initials = volunteer.name
    ? volunteer.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const eta = calcETA(distKm);

  return (
    <div className="glass animate-slide-in-right" style={{
      width: '100%',
      maxWidth: '600px',
      margin: '0 auto 1.5rem',
      overflow: 'visible',
    }}>
      {/* ── Header Banner ── */}
      <div style={{
        padding: '1.25rem 1.5rem',
        background: isResolved
          ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))'
          : 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))',
        borderBottom: `1px solid ${isResolved ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}`,
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}>
        {/* Pulse indicator */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: isResolved ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)',
            border: `2px solid ${isResolved ? 'var(--brand-success)' : 'var(--brand-primary)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: isResolved ? 'none' : 'pulseGlow 2s infinite',
          }}>
            {isResolved
              ? <CheckCircle size={24} color="var(--brand-success)" />
              : <Activity size={24} color="var(--brand-primary)" />
            }
          </div>
          {!isResolved && (
            <div style={{
              position: 'absolute',
              top: -4, right: -4,
              width: 14, height: 14,
              borderRadius: '50%',
              background: 'var(--brand-success)',
              border: '2px solid var(--bg-primary)',
              animation: 'heartbeat 1.5s infinite',
            }} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'white' }}>
            {isResolved ? '✅ Mission Completed' : '🚨 Volunteer is On the Way!'}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
            {isResolved
              ? `Resolved · ${new Date(sosData.resolved_at || Date.now()).toLocaleTimeString()}`
              : `Assigned ${formatElapsed(elapsedSecs)} · Tracking live`
            }
          </p>
        </div>
        {!isResolved && (
          <div style={{
            padding: '0.3rem 0.75rem',
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: '50px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-success)', animation: 'heartbeat 1s infinite' }} />
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--brand-success)' }}>LIVE</span>
          </div>
        )}
      </div>

      <div style={{ padding: '1.5rem' }}>

        {/* ── Journey Progress Bar ── */}
        <div className="journey-track">
          {STAGES.map((label, i) => {
            const isDone = stage > i;
            const isActive = stage === i;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div className={`journey-step ${isDone ? 'done' : isActive ? 'active' : ''}`} style={{ flex: 'none' }}>
                  <div className="journey-step-dot">
                    {isDone ? '✓' : isActive ? <Zap size={14} /> : i + 1}
                  </div>
                  <span className="journey-step-label">{label}</span>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`journey-connector ${isDone ? 'done' : ''}`} style={{ flex: 1 }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Volunteer Profile Card ── */}
        <div style={{
          padding: '1.25rem',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.08)',
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            {/* Avatar */}
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--brand-primary), #1d4ed8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 900,
              color: 'white',
              flexShrink: 0,
              boxShadow: '0 0 20px rgba(59,130,246,0.3)',
            }}>
              {initials}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'white' }}>{volunteer.name}</h4>
                <div style={{ padding: '0.15rem 0.5rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '20px' }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--brand-success)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Verified Volunteer
                  </span>
                </div>
              </div>
              {volunteer.experience_level && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Shield size={12} color="var(--brand-primary)" />
                  <span style={{ fontSize: '0.78rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
                    {volunteer.experience_level}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Skills */}
          {volunteer.skills && volunteer.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
              {(Array.isArray(volunteer.skills) ? volunteer.skills : [volunteer.skills]).map((skill) => (
                <span key={skill} style={{
                  padding: '0.2rem 0.6rem',
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  borderRadius: '20px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: 'var(--brand-primary)',
                }}>
                  {skill}
                </span>
              ))}
            </div>
          )}

          {/* Distance + ETA */}
          {distKm !== null && distKm < 999 && (
            <div style={{
              display: 'flex',
              gap: '1rem',
              padding: '0.75rem 1rem',
              background: 'rgba(59,130,246,0.06)',
              borderRadius: '10px',
              border: '1px solid rgba(59,130,246,0.15)',
              marginBottom: '1rem',
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Navigation size={14} color="var(--brand-primary)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'white' }}>
                  {distKm.toFixed(1)} km away
                </span>
              </div>
              {eta && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Clock size={14} color="var(--brand-warning)" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-warning)' }}>
                    {eta}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Phone */}
          {volunteer.phone && (
            <a
              href={`tel:${volunteer.phone}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.875rem',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.1))',
                border: '1px solid rgba(16,185,129,0.4)',
                color: 'var(--brand-success)',
                fontWeight: 800,
                fontSize: '1rem',
                textDecoration: 'none',
                transition: 'all 0.2s',
                boxShadow: '0 0 20px rgba(16,185,129,0.15)',
              }}
            >
              <Phone size={18} />
              Call {volunteer.name?.split(' ')[0]} — {volunteer.phone}
            </a>
          )}
        </div>

        {/* ── Location / Maps Link ── */}
        {sosData?.lat && sosData?.lng && !isResolved && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${volunteer?.location?.lat},${volunteer?.location?.lng}&destination=${sosData.lat},${sosData.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.75rem',
              borderRadius: '10px',
              background: 'rgba(66,133,244,0.1)',
              border: '1px solid rgba(66,133,244,0.3)',
              color: '#4285F4',
              fontWeight: 700,
              fontSize: '0.875rem',
              textDecoration: 'none',
              marginBottom: '1rem',
            }}
          >
            <MapPin size={16} />
            Track volunteer route via Maps
          </a>
        )}

        {/* ── Feedback Section (shown after resolved) ── */}
        {isResolved && (
          <div style={{
            marginTop: '1rem',
            padding: '1.25rem',
            background: 'rgba(245,158,11,0.06)',
            borderRadius: '14px',
            border: '1px solid rgba(245,158,11,0.2)',
          }}>
            {feedbackSubmitted ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🙏</div>
                <p style={{ color: 'var(--brand-success)', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                  Thank you for your feedback!
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
                  Your rating helps us improve volunteer quality.
                </p>
                {/* ── Reset: allow victim to send a new SOS ── */}
                <button
                  onClick={onClose}
                  style={{
                    width: '100%',
                    padding: '0.9rem',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, var(--brand-danger), #b91c1c)',
                    border: 'none',
                    color: 'white',
                    fontWeight: 800,
                    fontSize: '1rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 20px rgba(239,68,68,0.3)',
                    marginBottom: '0.75rem',
                  }}
                >
                  🆘 Send New SOS
                </button>
                <button
                  onClick={onClose}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Return to Home
                </button>
              </div>
            ) : (
              <>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.25rem' }}>
                  How was {volunteer.name?.split(' ')[0]}?
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '1rem' }}>
                  Rate your volunteer (no login needed)
                </p>
                <StarRating value={rating} onChange={setRating} disabled={feedbackSubmitted} />
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Any comments? (Optional)"
                  rows={2}
                  style={{
                    width: '100%',
                    marginTop: '0.875rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.3)',
                    color: 'white',
                    resize: 'none',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleFeedback}
                  disabled={!rating || submittingFeedback}
                  style={{
                    width: '100%',
                    marginTop: '0.875rem',
                    padding: '0.875rem',
                    borderRadius: '10px',
                    background: rating
                      ? 'linear-gradient(135deg, var(--brand-warning), #d97706)'
                      : 'rgba(255,255,255,0.05)',
                    border: 'none',
                    color: rating ? 'white' : 'var(--text-muted)',
                    fontWeight: 700,
                    cursor: rating ? 'pointer' : 'not-allowed',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s',
                    fontFamily: 'inherit',
                  }}
                >
                  <Star size={16} />
                  {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Cancel SOS & Resend (only before resolved) ── */}
        {!isResolved && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            {onResend && (
              <button
                onClick={onResend}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  borderRadius: '10px',
                  background: 'rgba(239,68,68,0.2)',
                  border: '1px solid rgba(239,68,68,0.5)',
                  color: 'var(--brand-danger)',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <Zap size={16} /> Resend SOS (Escalate)
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                width: '100%',
                padding: '0.875rem',
                borderRadius: '10px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel SOS / Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
