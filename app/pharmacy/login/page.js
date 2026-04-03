'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Mail, Lock, Building2, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import { auth, db } from '../../utils/firebaseClient';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
    
export default function PharmacyLogin() {
  const router = useRouter();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const clearState = () => {
    setError('');
    setSuccess('');
  };

  // ─── Login ────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    clearState();
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Role check
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (!snap.exists() || snap.data().role !== 'pharmacy') {
        await auth.signOut();
        setError('This account is not registered as a Pharmacy Volunteer.');
        setLoading(false);
        return;
      }
      router.push('/pharmacy');
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  // ─── Register ─────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    clearState();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        orgName,
        role: 'pharmacy',
        createdAt: new Date().toISOString(),
      });
      setSuccess('Account created! Redirecting...');
      setTimeout(() => router.push('/pharmacy'), 1500);
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
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/email-already-in-use':
        return 'This email is already registered. Try logging in.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return 'Something went wrong. Please try again.';
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Icon + Title */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '20px',
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}>
            <Truck size={30} color="var(--brand-primary)" />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 900, margin: '0 0 0.35rem' }}>
            Pharmacy Volunteer
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            {mode === 'login'
              ? 'Welcome back — log in to manage supplies'
              : 'Register your organization to log supplies'}
          </p>
        </div>

        {/* Card */}
        <div className="glass shadow-lg" style={{ borderRadius: '20px', padding: '2rem' }}>

          {/* Tab Toggle */}
          <div style={{
            display: 'flex', background: 'rgba(0,0,0,0.25)', borderRadius: '12px',
            padding: '4px', marginBottom: '1.75rem',
          }}>
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); clearState(); }}
                style={{
                  flex: 1, padding: '0.55rem', borderRadius: '9px', border: 'none',
                  fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: mode === m ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: mode === m ? 'var(--brand-primary)' : 'var(--text-secondary)',
                  boxShadow: mode === m ? '0 0 0 1px rgba(59,130,246,0.35)' : 'none',
                }}
              >
                {m === 'login' ? 'Login' : 'Register'}
              </button>
            ))}
          </div>

          {/* Error / Success */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1.25rem',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            }}>
              <AlertCircle size={16} color="var(--brand-danger)" />
              <span style={{ fontSize: '0.825rem', color: 'var(--brand-danger)', fontWeight: 600 }}>{error}</span>
            </div>
          )}
          {success && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1.25rem',
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
            }}>
              <CheckCircle size={16} color="var(--brand-success)" />
              <span style={{ fontSize: '0.825rem', color: 'var(--brand-success)', fontWeight: 600 }}>{success}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={mode === 'login' ? handleLogin : handleRegister}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

            {/* Org Name — only register */}
            {mode === 'register' && (
              <div>
                <label style={labelStyle}>Organization Name</label>
                <div style={inputWrap}>
                  <Building2 size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                  <input
                    required
                    type="text"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder="e.g. Apollo Pharmacy"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label style={labelStyle}>Email</label>
              <div style={inputWrap}>
                <Mail size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle}>Password</label>
              <div style={inputWrap}>
                <Lock size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Min 6 characters' : '••••••••'}
                  style={{ ...inputStyle, paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  style={{ position: 'absolute', right: '0.875rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, display: 'flex' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                  ? <><ArrowRight size={16} /> Login</>
                  : <><Truck size={16} /> Create Account</>
              }
            </button>
          </form>

          {/* Switch mode hint */}
          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already registered? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); clearState(); }}
              style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
            >
              {mode === 'login' ? 'Register here' : 'Login here'}
            </button>
          </p>

        </div>

        {/* Back link */}
        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <a href="/pharmacy" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            ← Back to Supply Resources
          </a>
        </p>

      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────
const labelStyle = {
  display: 'block', marginBottom: '0.4rem',
  fontWeight: 700, fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.5px',
};

const inputWrap = {
  display: 'flex', alignItems: 'center', gap: '0.6rem',
  padding: '0 0.875rem',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(0,0,0,0.3)',
  position: 'relative',
};

const inputStyle = {
  flex: 1, padding: '0.875rem 0',
  background: 'transparent',
  border: 'none', outline: 'none',
  color: 'white', fontSize: '0.9rem',
};