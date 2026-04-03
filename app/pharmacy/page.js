'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Package, CheckCircle, LogOut, Building2, Database, ThumbsUp, ThumbsDown, ShieldCheck, Truck, Lock } from 'lucide-react';
import { auth, db } from '../utils/firebaseClient';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';

export default function PharmacyNGO() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userOrgName, setUserOrgName] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState([]);
  const [orgName, setOrgName] = useState('');
  const [resourceType, setResourceType] = useState('First Aid Kits');
  const [qty, setQty] = useState('');

  // ─── Auth check — non-blocking, page loads for everyone ──────────
  useEffect(() => {
    if (!auth) {
      setAuthChecked(true);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user && db) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists() && snap.data().role === 'pharmacy') {
            setIsLoggedIn(true);
            setUserEmail(user.email || '');
            setUserOrgName(snap.data().orgName || '');
            setOrgName(snap.data().orgName || '');
          }
        } catch (e) {
          console.error('Role check failed:', e);
        }
      }
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  // ─── Load supplies — sabke liye ──────────────────────────────────
  useEffect(() => {
    if (!authChecked) return;
    const fetchResources = async () => {
      setLoading(true);
      try {
        if (db) {
          const snap = await getDocs(collection(db, 'pharmacy_resources'));
          const data = snap.docs.map(d => {
            const docData = d.data();
            const voters = docData.voters || {};
            const myVote = voters[userEmail.replace(/\./g, '_')] || null;
            return { id: d.id, voted: myVote, votersMap: voters, ...docData };
          });
          setResources(data);
        }
      } catch (err) {
        console.error('Failed to load resources:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchResources();
  }, [authChecked, userEmail]);

  const handleLogout = async () => {
    if (auth) await signOut(auth);
    setIsLoggedIn(false);
    setUserEmail('');
    setUserOrgName('');
    setOrgName('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newResource = {
      name: orgName,
      resource: resourceType,
      qty: parseInt(qty),
      confidence: 60,
      voters: {},
      createdAt: serverTimestamp(),
    };
    try {
      if (db) {
        const docRef = await addDoc(collection(db, 'pharmacy_resources'), newResource);
        setResources(prev => [...prev, { id: docRef.id, voted: null, votersMap: {}, ...newResource }]);
      } else {
        setResources(prev => [...prev, { id: Date.now(), voted: null, votersMap: {}, ...newResource }]);
      }
      setSuccess(true);
      setOrgName(userOrgName); setQty('');
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      console.error('Submit error:', err);
    }
  };

  const handleVote = async (id, isValid) => {
    if (!userEmail) return;
    setResources(prev => prev.map(r => {
      if (r.id !== id || r.voted) return r;
      const newConf = isValid ? Math.min(100, r.confidence + 15) : Math.max(0, r.confidence - 25);
      const voteValue = isValid ? 'yes' : 'no';
      const safeEmail = userEmail.replace(/\./g, '_');
      const updatedVoters = { ...(r.votersMap || {}), [safeEmail]: voteValue };
      if (db) {
        updateDoc(doc(db, 'pharmacy_resources', id), {
          confidence: newConf,
          [`voters.${safeEmail}`]: voteValue
        }).catch(console.error);
      }
      return { ...r, confidence: newConf, votersMap: updatedVoters, voted: voteValue };
    }));
  };

  // Loading state
  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--brand-primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>

      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={24} color="var(--brand-primary)" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>Supply Resources</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              {isLoggedIn ? `Logged in as ${userEmail}` : 'Public view — login to add supplies'}
            </p>
          </div>
        </div>

        {isLoggedIn && (
          <button onClick={handleLogout} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--brand-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600 }}>
            <LogOut size={14} /> Logout
          </button>
        )}
      </div>

      {/* Success Toast */}
      {success && (
        <div className="animate-slide-up" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CheckCircle size={20} color="var(--brand-success)" />
          <span style={{ fontWeight: 600, color: 'var(--brand-success)' }}>Inventory logged successfully!</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>

        {/* Left — Add form (sirf pharmacy volunteer ko) ya login prompt */}
        <div style={{ flex: '1 1 340px' }}>
          {isLoggedIn ? (
            <div className="glass shadow-lg" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Package size={20} color="var(--brand-primary)" /> Log New Inventory
              </h2>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Organization Name</label>
                  <input required type="text" value={orgName} readOnly style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.15)', color: 'rgba(255,255,255,0.5)', outline: 'none', cursor: 'not-allowed' }} />
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resource Type</label>
                    <select value={resourceType} onChange={e => setResourceType(e.target.value)} style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', appearance: 'none' }}>
                      <option>First Aid Kits</option>
                      <option>Blankets</option>
                      <option>Food Packets</option>
                      <option>Oxygen Cylinders</option>
                      <option>Antibiotics</option>
                      <option>Water Bottles</option>
                    </select>
                  </div>
                  <div style={{ width: '100px' }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Qty</label>
                    <input required type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="50" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none' }} />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                  <Database size={16} /> Submit to Resource Engine
                </button>
              </form>
            </div>
          ) : (
            /* ── LOGIN PROMPT — updated href ── */
            <div className="glass" style={{ padding: '2.5rem', textAlign: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
                <Lock size={24} color="var(--brand-warning)" />
              </div>
              <h3 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Want to add supplies?</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                Register as a Pharmacy Volunteer to log and manage supply inventory.
              </p>
              {/* ✅ UPDATED: /volunteer → /pharmacy/login */}
              <a href="/pharmacy/login"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: '10px', background: 'linear-gradient(135deg, var(--brand-primary), #1d4ed8)', color: 'white', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}>
                <Truck size={16} /> Login as Pharmacy Volunteer
              </a>
            </div>
          )}
        </div>

        {/* Right — Public supplies list */}
        <div style={{ flex: '1 1 340px' }}>
          <div className="glass shadow-lg" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} color="var(--brand-success)" /> Available Supplies
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {loading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Loading supplies...</div>
              ) : resources.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', opacity: 0.7 }}>
                  <Package size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4, display: 'block' }} />
                  No supplies logged yet.
                </div>
              ) : resources.map((res) => {
                const confColor = res.confidence > 80 ? 'var(--brand-success)' : res.confidence < 50 ? 'var(--brand-danger)' : 'var(--brand-warning)';
                return (
                  <div key={res.id} className="animate-slide-up" style={{ padding: '1.25rem', background: 'rgba(5,8,15,0.4)', borderRadius: '14px', borderLeft: `4px solid ${confColor}` }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>{res.name}</h3>
                      <span style={{ fontSize: '0.75rem', fontWeight: 900, color: confColor }}>
                        {res.confidence}% verified
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                      <strong style={{ color: 'white' }}>{res.qty} {res.resource}</strong> available
                    </p>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '1rem', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${res.confidence}%`, background: confColor, borderRadius: '2px', transition: 'width 0.6s ease' }} />
                    </div>

                    {/* Voting — sirf logged in pharmacy volunteers */}
                    {isLoggedIn ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1, fontWeight: 600 }}>Still accurate?</span>
                        <button onClick={() => handleVote(res.id, true)} disabled={res.voted !== null} style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: res.voted === 'yes' ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.03)', border: `1px solid ${res.voted === 'yes' ? 'var(--brand-success)' : 'rgba(255,255,255,0.1)'}`, color: res.voted === 'yes' ? 'var(--brand-success)' : 'var(--text-secondary)', cursor: res.voted === null ? 'pointer' : 'not-allowed', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <ThumbsUp size={12} /> YES
                        </button>
                        <button onClick={() => handleVote(res.id, false)} disabled={res.voted !== null} style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: res.voted === 'no' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.03)', border: `1px solid ${res.voted === 'no' ? 'var(--brand-danger)' : 'rgba(255,255,255,0.1)'}`, color: res.voted === 'no' ? 'var(--brand-danger)' : 'var(--text-secondary)', cursor: res.voted === null ? 'pointer' : 'not-allowed', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <ThumbsDown size={12} /> NO
                        </button>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic' }}>
                        Login as pharmacy volunteer to verify
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}