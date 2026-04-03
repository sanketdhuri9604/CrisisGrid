'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Plus, Package, CheckCircle, Clock, Zap, LogOut, ShieldAlert, Building2, Database, ThumbsUp, ThumbsDown, ShieldCheck, AlertTriangle } from 'lucide-react';
import { auth, db } from '../utils/firebaseClient';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, addDoc, updateDoc, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

export default function PharmacyNGO() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const [resources, setResources] = useState([]);

  const [orgName, setOrgName] = useState('');
  const [resourceType, setResourceType] = useState('First Aid Kits');
  const [qty, setQty] = useState('');

  useEffect(() => {
    if (!auth) {
      setIsAuthed(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (db) {
          try {
           const snap = await getDoc(doc(db, 'users', user.uid));
if (!snap.exists() || snap.data().role !== 'pharmacy') {
  router.push('/login');
  return;
}
          } catch (e) {
            console.error('Role check failed:', e);
          }
        }
        setIsAuthed(true);
        setUserEmail(user.email || '');
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Firestore se data load karo
  useEffect(() => {
    if (!isAuthed) return;
    const fetchResources = async () => {
      setLoading(true);
      try {
        if (db) {
          const snap = await getDocs(collection(db, 'pharmacy_resources'));
          const data = snap.docs.map(d => {
            const docData = d.data();
            const voters = docData.voters || {};
            // Determine if the current user has already voted on this item
            const myVote = voters[userEmail] || null;
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
  }, [isAuthed, userEmail]);

  const handleLogout = async () => {
    if (auth) await signOut(auth);
    router.push('/login');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newResource = {
      name: orgName,
      resource: resourceType,
      qty: parseInt(qty),
      confidence: 60,
      voters: {}, // Tracks who voted { "email@example.com": "yes" }
      createdAt: serverTimestamp(),
    };
    try {
      if (db) {
        const docRef = await addDoc(collection(db, 'pharmacy_resources'), newResource);
        setResources(prev => [...prev, { id: docRef.id, voted: null, ...newResource }]);
      } else {
        setResources(prev => [...prev, { id: Date.now(), voted: null, ...newResource }]);
      }
      setSuccess(true);
      setOrgName(''); setQty('');
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      console.error('Submit error:', err);
    }
  };

  const handleVote = async (id, isValid) => {
    if (!userEmail) return; // Must have email to track vote

    setResources(prev => prev.map(r => {
      if (r.id === id) {
        if (r.voted) return r; // Already voted

        const newConf = isValid ? Math.min(100, r.confidence + 15) : Math.max(0, r.confidence - 25);
        const voteValue = isValid ? 'yes' : 'no';
        const updatedVoters = { ...(r.votersMap || {}), [userEmail]: voteValue };

        // Firestore update (saving confidence and the new voter map)
        if (db) {
          updateDoc(doc(db, 'pharmacy_resources', id), { 
            confidence: newConf,
            [`voters.${userEmail.replace(/\./g, '_')}`]: voteValue // Firestore keys can't have dots sometimes, safe sanitize
          }).catch(console.error);
        }

        return { ...r, confidence: newConf, votersMap: updatedVoters, voted: voteValue };
      }
      return r;
    }));
  };

  if (!isAuthed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--brand-primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem auto' }} />
          <p>Verifying authentication...</p>
        </div>
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
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>Pharmacy & NGO Portal</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>Layer-1 Distributed Inventory Engine</p>
          </div>
        </div>
        <button onClick={handleLogout} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--brand-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600 }}>
          <LogOut size={14} /> Logout
        </button>
      </div>

      {/* Success Toast */}
      {success && (
        <div className="animate-slide-up" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CheckCircle size={20} color="var(--brand-success)" />
          <span style={{ fontWeight: 600, color: 'var(--brand-success)' }}>Inventory logged! AI Resource Engine has indexed these supplies.</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>

        {/* Log Inventory Form */}
        <div style={{ flex: '1 1 340px' }}>
          <div className="glass shadow-lg" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <Package size={20} color="var(--brand-primary)" /> Log New Inventory
            </h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Organization Name</label>
                <input required type="text" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="e.g. Apollo Pharmacy" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none' }} />
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
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem', background: 'linear-gradient(135deg, var(--brand-primary), #1e3a8a)', boxShadow: '0 8px 24px -6px rgba(59,130,246,0.5)' }}>
                <Database size={16} /> Submit to AI Resource Engine
              </button>
            </form>
          </div>
        </div>

        {/* Crowd Verification Panel */}
        <div style={{ flex: '1 1 340px' }}>
          <div className="glass shadow-lg" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <ShieldCheck size={20} color="var(--brand-success)" /> Crowd Verification Index
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {loading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>Loading inventory...</div>
              ) : resources.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', opacity: 0.7 }}>No inventory logged yet.</div>
              ) : resources.map((res) => {
                const confColor = res.confidence > 80 ? 'var(--brand-success)' : res.confidence < 50 ? 'var(--brand-danger)' : 'var(--brand-warning)';
                return (
                  <div key={res.id} className="animate-slide-up delay-1 neon-border" style={{ padding: '1.25rem', background: 'rgba(5, 8, 15, 0.4)', borderRadius: '14px', borderLeft: `4px solid ${confColor}` }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, letterSpacing: '0.5px' }}>{res.name}</h3>
                      <span style={{ fontSize: '0.75rem', fontWeight: 900, color: confColor, textShadow: `0 0 10px ${confColor}` }}>
                        {res.confidence}% VERIFIED
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      <strong style={{ color: 'white', fontWeight: 700 }}>{res.qty} {res.resource}</strong> logged
                    </p>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '1rem', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${res.confidence}%`, background: confColor, borderRadius: '2px', transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)', boxShadow: `0 0 10px ${confColor}` }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flex: 1, fontWeight: 600 }}>Is this still accurate?</span>
                      <button onClick={() => handleVote(res.id, true)} disabled={res.voted !== null} style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: res.voted === 'yes' ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.03)', border: `1px solid ${res.voted === 'yes' ? 'var(--brand-success)' : 'rgba(255,255,255,0.1)'}`, color: res.voted === 'yes' ? 'var(--brand-success)' : 'var(--text-secondary)', cursor: res.voted === null ? 'pointer' : 'not-allowed', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.25rem', transition: 'all 0.2s' }}>
                        <ThumbsUp size={12} /> YES
                      </button>
                      <button onClick={() => handleVote(res.id, false)} disabled={res.voted !== null} style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: res.voted === 'no' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.03)', border: `1px solid ${res.voted === 'no' ? 'var(--brand-danger)' : 'rgba(255,255,255,0.1)'}`, color: res.voted === 'no' ? 'var(--brand-danger)' : 'var(--text-secondary)', cursor: res.voted === null ? 'pointer' : 'not-allowed', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.25rem', transition: 'all 0.2s' }}>
                        <ThumbsDown size={12} /> NO
                      </button>
                    </div>
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