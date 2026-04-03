'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Mail, Lock, Eye, EyeOff, AlertTriangle, LogIn, KeyRound, UserPlus } from 'lucide-react';
import { auth, db } from '../utils/firebaseClient';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET_CODE || 'CHANGEME123';

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const clearState = () => { setError(''); setSuccess(''); };

  // ─── Login — sirf admin ───────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!auth) { setError('Firebase Auth not configured.'); return; }
    setLoading(true);
    clearState();
    try {
      await setPersistence(auth, browserSessionPersistence);
      const userCred = await signInWithEmailAndPassword(auth, email, password);

      let role = null;
      if (db) {
        const snap = await getDoc(doc(db, 'users', userCred.user.uid));
        if (snap.exists()) role = snap.data().role || null;
      }

      if (role === 'admin') {
        router.push('/dashboard');
      } else {
        // Non-admin login block
        await signOut(auth);
        setError('Access denied. This portal is for admins only.');
      }
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  // ─── Register — secret code check + admin role set ───────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    clearState();

    if (secretCode !== ADMIN_SECRET) {
      setError('Invalid security code. Contact the system administrator.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        role: 'admin',
        createdAt: new Date().toISOString(),
      });
      setSuccess('Admin account created! Redirecting...');
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const friendlyError = (code) => {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential': return 'Invalid email or password.';
      case 'auth/email-already-in-use': return 'This email is already registered.';
      case 'auth/invalid-email': return 'Please enter a valid email address.';
      case 'auth/too-many-requests': return 'Too many attempts. Try again later.';
      default: return 'Something went wrong. Please try again.';
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', position: 'relative', overflow: 'hidden' }}>

      {/* Ambient glows */}
      <div style={{ position: 'fixed', top: '-120px', left: '-120px', width: '450px', height: '450px', background: 'rgba(239,68,68,0.1)', filter: 'blur(90px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-120px', right: '-120px', width: '450px', height: '450px', background: 'rgba(59,130,246,0.1)', filter: 'blur(90px)', borderRadius: '50%', pointerEvents: 'none' }} />

      <div className="glass shadow-lg animate-slide-up" style={{ padding: '3rem 2.75rem', maxWidth: '440px', width: '100%', position: 'relative', overflow: 'hidden', background: 'rgba(10,15,28,0.85)' }}>

        {/* Top glow */}
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '160px', height: '160px', background: 'rgba(239,68,68,0.15)', filter: 'blur(50px)', borderRadius: '50%', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="animate-pulse-glow" style={{ width: '68px', height: '68px', margin: '0 auto 1rem', borderRadius: '20px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(239,68,68,0.15)' }}>
            <ShieldAlert size={34} color="var(--brand-danger)" />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: '0.3rem', background: 'linear-gradient(135deg, #fff, rgba(255,255,255,0.7))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            CrisisGrid
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {mode === 'login' ? 'Admin Command Center' : 'Register New Admin Account'}
          </p>
        </div>

        {/* Tab Toggle */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.25)', borderRadius: '12px', padding: '4px', marginBottom: '1.75rem' }}>
          {['login', 'register'].map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); clearState(); }}
              style={{
                flex: 1, padding: '0.55rem', borderRadius: '9px', border: 'none',
                fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.2s',
                background: mode === m ? 'rgba(239,68,68,0.15)' : 'transparent',
                color: mode === m ? 'var(--brand-danger)' : 'var(--text-secondary)',
                boxShadow: mode === m ? '0 0 0 1px rgba(239,68,68,0.3)' : 'none',
              }}
            >
              {m === 'login' ? <><LogIn size={13} style={{ display: 'inline', marginRight: '5px' }} />Login</> : <><UserPlus size={13} style={{ display: 'inline', marginRight: '5px' }} />Register</>}
            </button>
          ))}
        </div>

        {/* Error / Success */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', marginBottom: '1.25rem' }}>
            <AlertTriangle size={15} color="var(--brand-danger)" />
            <span style={{ color: 'var(--brand-danger)', fontSize: '0.825rem', fontWeight: 600 }}>{error}</span>
          </div>
        )}
        {success && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', marginBottom: '1.25rem' }}>
            <ShieldAlert size={15} color="var(--brand-success)" />
            <span style={{ color: 'var(--brand-success)', fontSize: '0.825rem', fontWeight: 600 }}>{success}</span>
          </div>
        )}

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

          {/* Email */}
          <div>
            <label style={labelStyle}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input required type="email" value={email} autoFocus
                onChange={e => { setEmail(e.target.value); clearState(); }}
                placeholder="admin@example.com"
                style={{ ...inputStyle, paddingLeft: '2.75rem', border: error ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input required type={showPassword ? 'text' : 'password'} value={password}
                onChange={e => { setPassword(e.target.value); clearState(); }}
                placeholder="••••••••"
                style={{ ...inputStyle, paddingLeft: '2.75rem', paddingRight: '3rem', border: error ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(255,255,255,0.08)' }}
              />
              <button type="button" onClick={() => setShowPassword(p => !p)}
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0 }}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Confirm Password — register only */}
          {mode === 'register' && (
            <div>
              <label style={labelStyle}>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input required type="password" value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); clearState(); }}
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingLeft: '2.75rem', border: '1px solid rgba(255,255,255,0.08)' }}
                />
              </div>
            </div>
          )}

          {/* Security Code — register only */}
          {mode === 'register' && (
            <div>
              <label style={labelStyle}>
                <KeyRound size={11} style={{ display: 'inline', marginRight: '4px' }} />
                Security Code
              </label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={15} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input required type={showSecret ? 'text' : 'password'} value={secretCode}
                  onChange={e => { setSecretCode(e.target.value); clearState(); }}
                  placeholder="Enter admin secret code"
                  style={{ ...inputStyle, paddingLeft: '2.75rem', paddingRight: '3rem', border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)' }}
                />
                <button type="button" onClick={() => setShowSecret(p => !p)}
                  style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0 }}>
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.35rem', marginBottom: 0 }}>
                Set via <code style={{ background: 'rgba(255,255,255,0.08)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>NEXT_PUBLIC_ADMIN_SECRET_CODE</code> in .env.local
              </p>
            </div>
          )}

          {/* Submit */}
          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem', padding: '1rem', borderRadius: '12px', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? (
              <><div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} /> Please wait...</>
            ) : mode === 'login' ? (
              <><LogIn size={16} /> Sign In to Dashboard</>
            ) : (
              <><UserPlus size={16} /> Create Admin Account</>
            )}
          </button>
        </form>

        {/* Info box */}
        <div style={{ marginTop: '1.75rem', padding: '0.875rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: 'rgba(255,255,255,0.4)' }}>Admin only portal.</strong> Volunteers & pharmacy staff use their own login pages. Unauthorized access attempts are blocked.
          </p>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block', marginBottom: '0.4rem',
  fontSize: '0.75rem', fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.5px',
};

const inputStyle = {
  width: '100%',
  padding: '0.9rem 1rem',
  borderRadius: '12px',
  background: 'rgba(0,0,0,0.35)',
  color: 'white', outline: 'none',
  fontSize: '0.95rem', transition: 'border 0.2s',
};