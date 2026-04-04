'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, ChevronRight, X, Clock } from 'lucide-react';

export default function SessionRestoreBanner({ onResume, onDismiss }) {
  const [session, setSession] = useState(null);
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('active_sos_session');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      // Only show if session is less than 24 hours old
      if (parsed.target_res_time && Date.now() < parsed.target_res_time + 86400000) {
        setSession(parsed);
      } else {
        localStorage.removeItem('active_sos_session');
      }
    } catch (e) {
      localStorage.removeItem('active_sos_session');
    }
  }, []);

  // Update elapsed time every 30s
  useEffect(() => {
    if (!session?.target_res_time) return;
    const sentAt = session.target_res_time - 15 * 60 * 1000;
    const update = () => {
      const diffMs = Date.now() - sentAt;
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) setElapsed('just now');
      else if (mins < 60) setElapsed(`${mins} min ago`);
      else setElapsed(`${Math.floor(mins / 60)}h ago`);
    };
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [session]);

  if (!session) return null;

  const statusColor = {
    synced: 'var(--brand-success)',
    queued: 'var(--brand-warning)',
  }[session.syncStatus] || 'var(--brand-primary)';

  const statusLabel = {
    synced: '📡 Synced to Server',
    queued: '📦 Queued Offline',
  }[session.syncStatus] || '⚡ Active';

  return (
    <div className="session-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: 0 }}>
        {/* Pulsing indicator */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.15)',
            border: '2px solid rgba(239,68,68,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pulseGlow 2s infinite',
          }}>
            <AlertCircle size={20} color="var(--brand-danger)" />
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'white' }}>
              Active SOS Detected
            </span>
            <span style={{
              padding: '0.15rem 0.5rem',
              background: `${statusColor}18`,
              border: `1px solid ${statusColor}40`,
              borderRadius: '20px',
              fontSize: '0.65rem',
              fontWeight: 700,
              color: statusColor,
            }}>
              {statusLabel}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
            <Clock size={11} color="var(--text-muted)" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Sent {elapsed}
              {session.priority && (
                <span style={{ marginLeft: '0.5rem', color: session.priority === 'HIGH' ? 'var(--brand-danger)' : 'var(--brand-warning)', fontWeight: 700 }}>
                  · {session.priority} PRIORITY
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <button
          onClick={() => onResume(session)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.55rem 1rem',
            borderRadius: '9px',
            background: 'var(--brand-danger)',
            border: 'none',
            color: 'white',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
            boxShadow: '0 4px 12px rgba(239,68,68,0.35)',
          }}
        >
          Track SOS <ChevronRight size={14} />
        </button>
        <button
          onClick={() => {
            localStorage.removeItem('active_sos_session');
            setSession(null);
            onDismiss?.();
          }}
          title="Dismiss"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
