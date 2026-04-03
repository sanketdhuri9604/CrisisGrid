'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Mail, Lock, Eye, EyeOff, AlertTriangle, LogIn } from 'lucide-react';
import { auth } from '../utils/firebaseClient';
import { signInWithEmailAndPassword } from 'firebase/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!auth) {
      setError('Firebase Auth is not configured. Please check your .env.local file.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Redirect based on role (use email prefix as simple role check)
      if (email.startsWith('ngo') || email.includes('pharmacy')) {
        router.push('/pharmacy');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', position: 'relative', overflow: 'hidden' }}>
      {/* Ambient glows */}
      <div style={{ position: 'fixed', top: '-120px', left: '-120px', width: '450px', height: '450px', background: 'rgba(239,68,68,0.1)', filter: 'blur(90px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-120px', right: '-120px', width: '450px', height: '450px', background: 'rgba(59,130,246,0.1)', filter: 'blur(90px)', borderRadius: '50%', pointerEvents: 'none' }} />

      <div className="glass shadow-lg animate-slide-up" style={{ padding: '3.5rem 3rem', maxWidth: '440px', width: '100%', position: 'relative', overflow: 'hidden', background: 'rgba(10,15,28,0.85)' }}>

        {/* Top glow */}
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '160px', height: '160px', background: 'rgba(239,68,68,0.15)', filter: 'blur(50px)', borderRadius: '50%', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div className="animate-pulse-glow" style={{ width: '72px', height: '72px', margin: '0 auto 1.25rem auto', borderRadius: '20px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(239,68,68,0.15)' }}>
            <ShieldAlert size={36} color="var(--brand-danger)" />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 900, marginBottom: '0.4rem', background: 'linear-gradient(135deg, #fff, rgba(255,255,255,0.7))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            CrisisGrid Admin
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Sign in with your authorized account to access the Command Center.
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Email */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                required
                type="email"
                value={email}
                autoFocus
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="admin@crisisgrid.com"
                style={{ width: '100%', padding: '0.9rem 1rem 0.9rem 2.75rem', borderRadius: '12px', border: error ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.35)', color: 'white', outline: 'none', fontSize: '0.95rem', transition: 'all 0.2s' }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                style={{ width: '100%', padding: '0.9rem 3rem 0.9rem 2.75rem', borderRadius: '12px', border: error ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.35)', color: 'white', outline: 'none', fontSize: '1rem', letterSpacing: '0.15em', transition: 'all 0.2s' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0 }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px' }}>
              <AlertTriangle size={15} color="var(--brand-danger)" />
              <span style={{ color: 'var(--brand-danger)', fontSize: '0.85rem', fontWeight: 600 }}>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem', padding: '1rem', borderRadius: '12px', cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? (
              <>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                Authenticating...
              </>
            ) : (
              <>
                <LogIn size={18} /> Sign In to Command Center
              </>
            )}
          </button>
        </form>

        {/* Helper */}
        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>To create admin accounts:</strong><br />
            Go to your Firebase Console → Authentication → Users → Add User.<br />
            Use <code style={{ background: 'rgba(255,255,255,0.08)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>admin@crisisgrid.com</code> for Admin access and <code style={{ background: 'rgba(255,255,255,0.08)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>ngo@crisisgrid.com</code> for NGO access.
          </p>
        </div>
      </div>
    </div>
  );
}
