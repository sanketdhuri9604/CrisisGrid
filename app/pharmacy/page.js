'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus, Package, CheckCircle, LogOut, Building2, Database,
  ThumbsUp, ThumbsDown, ShieldCheck, Truck, Lock, Search,
  MapPin, Phone, Navigation, X, Filter, Pill,
} from 'lucide-react';
import { auth, db } from '../utils/firebaseClient';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';

const RESOURCE_TYPES = [
  'First Aid Kits', 'Blankets', 'Food Packets', 'Oxygen Cylinders',
  'Antibiotics', 'Water Bottles', 'Paracetamol', 'Insulin',
  'Blood Pressure Meds', 'Antiseptic', 'Surgical Masks', 'Gloves',
  'IV Fluids', 'Bandages', 'Pain Relievers', 'Other Medicines',
];

function PharmacyNGOContent() {
  const router = useRouter();

  const [authChecked, setAuthChecked]   = useState(false);
  const [isLoggedIn, setIsLoggedIn]     = useState(false);
  const [userEmail, setUserEmail]       = useState('');
  const [userOrgName, setUserOrgName]   = useState('');
  const [success, setSuccess]           = useState(false);
  const [loading, setLoading]           = useState(true);
  const [resources, setResources]       = useState([]);
  const [activeTab, setActiveTab]       = useState('find'); // 'find' | 'log'

  // Form state (pharmacy submit)
  const [orgName, setOrgName]           = useState('');
  const [resourceType, setResourceType] = useState('First Aid Kits');
  const [qty, setQty]                   = useState('');
  const [address, setAddress]           = useState('');
  const [phone, setPhone]               = useState('');

  // Finder state
  const [searchQuery, setSearchQuery]   = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [locLoading, setLocLoading]     = useState(false);

  // ─── Auth check ───────────────────────────────────────────────
  useEffect(() => {
    if (!auth) { setAuthChecked(true); return; }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user && db) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists() && snap.data().role === 'pharmacy') {
            setIsLoggedIn(true);
            setUserEmail(user.email || '');
            const org = snap.data().orgName || '';
            setUserOrgName(org);
            setOrgName(org);
          }
        } catch (e) { console.error('Role check failed:', e); }
      }
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  // ─── Load supplies ────────────────────────────────────────────
  useEffect(() => {
    if (!authChecked) return;
    const fetchResources = async () => {
      setLoading(true);
      try {
        if (db) {
          const snap = await getDocs(collection(db, 'pharmacy_resources'));
          const data = snap.docs.map(d => {
            const docData = d.data();
            const voters  = docData.voters || {};
            const myVote  = voters[userEmail.replace(/\./g, '_')] || null;
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

  // ─── Get user GPS for directions ─────────────────────────────
  const getUserLocation = () => {
    setLocLoading(true);
    if (!navigator.geolocation) { setLocLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocLoading(false);
      },
      () => setLocLoading(false),
      { timeout: 8000 }
    );
  };

  useEffect(() => { getUserLocation(); }, []);

  // ─── Directions link ──────────────────────────────────────────
  const getDirectionsUrl = (dest) => {
    if (userLocation) {
      return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${encodeURIComponent(dest)}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
  };

  // ─── Logout ───────────────────────────────────────────────────
  const handleLogout = async () => {
    if (auth) await signOut(auth);
    setIsLoggedIn(false); setUserEmail(''); setUserOrgName(''); setOrgName('');
    router.push('/pharmacy/login');
  };

  // ─── Submit supply ────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const newResource = {
      name: orgName,
      resource: resourceType,
      qty: parseInt(qty),
      address: address.trim(),
      phone: phone.trim(),
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
      setOrgName(userOrgName); setQty(''); setAddress(''); setPhone('');
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      console.error('Submit error:', err);
    }
  };

  // ─── Vote ────────────────────────────────────────────────────
  const handleVote = async (id, isValid) => {
    if (!userEmail) return;
    setResources(prev => prev.map(r => {
      if (r.id !== id || r.voted) return r;
      const newConf    = isValid ? Math.min(100, r.confidence + 15) : Math.max(0, r.confidence - 25);
      const voteValue  = isValid ? 'yes' : 'no';
      const safeEmail  = userEmail.replace(/\./g, '_');
      const updatedVoters = { ...(r.votersMap || {}), [safeEmail]: voteValue };
      if (db) {
        updateDoc(doc(db, 'pharmacy_resources', id), {
          confidence: newConf,
          [`voters.${safeEmail}`]: voteValue,
        }).catch(console.error);
      }
      return { ...r, confidence: newConf, votersMap: updatedVoters, voted: voteValue };
    }));
  };

  // ─── Filter resources ─────────────────────────────────────────
  const filtered = resources.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.name || '').toLowerCase().includes(q) ||
      (r.resource || '').toLowerCase().includes(q) ||
      (r.address || '').toLowerCase().includes(q)
    );
  });

  // ─── Loading ──────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--brand-primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Pill size={24} color="var(--brand-primary)" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>Medicine Finder</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              {isLoggedIn ? `Managing as ${userEmail}` : 'Find medicines & supplies near you'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isLoggedIn && (
            <button onClick={handleLogout} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--brand-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}>
              <LogOut size={14} /> Logout
            </button>
          )}
          {!isLoggedIn && (
            <a href="/pharmacy/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--brand-primary)', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
              <Lock size={14} /> Pharmacy Login
            </a>
          )}
        </div>
      </div>

      {/* ── Tab Switch ── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem', padding: '0.375rem', background: 'rgba(0,0,0,0.3)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
        {[
          { key: 'find', icon: <Search size={15} />, label: 'Find Medicine' },
          { key: 'log',  icon: <Database size={15} />, label: isLoggedIn ? 'Log Inventory' : 'Add Supplies' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.6rem 1.25rem', borderRadius: '10px',
              background: activeTab === tab.key ? 'var(--brand-primary)' : 'transparent',
              border: 'none', color: activeTab === tab.key ? 'white' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Success Toast ── */}
      {success && (
        <div className="animate-slide-up" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CheckCircle size={20} color="var(--brand-success)" />
          <span style={{ fontWeight: 600, color: 'var(--brand-success)' }}>Inventory logged successfully!</span>
        </div>
      )}

      {/* ════════════════════════════════════════════
          TAB: FIND MEDICINE
      ════════════════════════════════════════════ */}
      {activeTab === 'find' && (
        <>
          {/* Search bar */}
          <div style={{ position: 'relative', marginBottom: '1.5rem', maxWidth: '600px' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search medicine, supply or pharmacy name…"
              style={{
                width: '100%', padding: '0.875rem 1rem 0.875rem 3rem',
                borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.35)', color: 'white',
                outline: 'none', fontSize: '0.95rem', fontFamily: 'inherit',
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={16} />
              </button>
            )}
          </div>

          {/* Location indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', fontSize: '0.78rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: userLocation ? 'var(--brand-success)' : 'var(--brand-warning)', animation: 'heartbeat 2s infinite' }} />
            <span style={{ color: userLocation ? 'var(--brand-success)' : 'var(--brand-warning)', fontWeight: 600 }}>
              {locLoading ? 'Detecting your location…' : userLocation ? 'Your location detected — directions will be from you' : 'Location unavailable — directions will open Google Maps search'}
            </span>
          </div>

          {/* Cards grid */}
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '4rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid var(--brand-primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
              Loading supplies…
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Package size={48} style={{ margin: '0 auto 1rem', opacity: 0.3, display: 'block' }} />
              <p style={{ fontWeight: 600, fontSize: '1rem' }}>{searchQuery ? `No results for "${searchQuery}"` : 'No supplies logged yet'}</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>
                {searchQuery ? 'Try a different medicine or pharmacy name.' : 'Pharmacy volunteers can log their inventory using the "Log Inventory" tab.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {filtered.map(res => {
                const confColor = res.confidence > 80 ? 'var(--brand-success)' : res.confidence < 50 ? 'var(--brand-danger)' : 'var(--brand-warning)';
                const hasLocation = res.address && res.address.trim();
                return (
                  <div key={res.id} className="glass animate-slide-up" style={{ padding: '1.5rem', borderRadius: '18px', borderLeft: `4px solid ${confColor}`, display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 0.25rem', color: 'white' }}>{res.name || 'Unknown Pharmacy'}</h3>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: confColor, background: `${confColor}18`, padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                          {res.confidence}% verified
                        </span>
                      </div>
                      <div style={{ padding: '0.4rem 0.75rem', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--brand-primary)', lineHeight: 1 }}>{res.qty}</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}>units</div>
                      </div>
                    </div>

                    {/* Medicine pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Pill size={14} color="var(--brand-primary)" />
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>{res.resource}</span>
                    </div>

                    {/* Confidence bar */}
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${res.confidence}%`, background: confColor, borderRadius: '2px', transition: 'width 0.6s ease' }} />
                    </div>

                    {/* Address */}
                    {hasLocation && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <MapPin size={14} color="var(--brand-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{res.address}</span>
                      </div>
                    )}

                    {/* Phone */}
                    {res.phone && (
                      <a href={`tel:${res.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--brand-warning)', fontWeight: 700, textDecoration: 'none' }}>
                        <Phone size={13} /> {res.phone}
                      </a>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                      {hasLocation ? (
                        <a
                          href={getDirectionsUrl(res.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                            padding: '0.65rem', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #4285F4, #1a73e8)',
                            color: 'white', fontWeight: 800, fontSize: '0.8rem', textDecoration: 'none',
                            boxShadow: '0 4px 15px rgba(66,133,244,0.3)',
                          }}
                        >
                          <Navigation size={14} /> Get Directions
                        </a>
                      ) : (
                        <div style={{ flex: 1, padding: '0.65rem', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', fontStyle: 'italic' }}>
                          No address on file
                        </div>
                      )}

                      {/* Verify vote (logged-in pharmacy volunteers only) */}
                      {isLoggedIn && (
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button onClick={() => handleVote(res.id, true)} disabled={res.voted !== null} title="Still accurate" style={{ padding: '0.5rem 0.6rem', borderRadius: '8px', background: res.voted === 'yes' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${res.voted === 'yes' ? 'var(--brand-success)' : 'rgba(255,255,255,0.1)'}`, color: res.voted === 'yes' ? 'var(--brand-success)' : 'var(--text-secondary)', cursor: res.voted === null ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                            <ThumbsUp size={13} />
                          </button>
                          <button onClick={() => handleVote(res.id, false)} disabled={res.voted !== null} title="Out of stock / inaccurate" style={{ padding: '0.5rem 0.6rem', borderRadius: '8px', background: res.voted === 'no' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${res.voted === 'no' ? 'var(--brand-danger)' : 'rgba(255,255,255,0.1)'}`, color: res.voted === 'no' ? 'var(--brand-danger)' : 'var(--text-secondary)', cursor: res.voted === null ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                            <ThumbsDown size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════
          TAB: LOG INVENTORY
      ════════════════════════════════════════════ */}
      {activeTab === 'log' && (
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 340px' }}>
            {isLoggedIn ? (
              <div className="glass shadow-lg" style={{ padding: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Package size={20} color="var(--brand-primary)" /> Log New Inventory
                </h2>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Org name (readonly) */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Organization Name</label>
                    <input required type="text" value={orgName} readOnly style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.15)', color: 'rgba(255,255,255,0.5)', outline: 'none', cursor: 'not-allowed' }} />
                  </div>

                  {/* Resource + qty */}
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Medicine / Resource</label>
                      <select value={resourceType} onChange={e => setResourceType(e.target.value)} style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', appearance: 'none', fontFamily: 'inherit' }}>
                        {RESOURCE_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ width: '100px' }}>
                      <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Qty</label>
                      <input required type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="50" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', fontFamily: 'inherit' }} />
                    </div>
                  </div>

                  {/* Address — new field */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      📍 Address <span style={{ color: 'var(--brand-primary)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>(for directions)</span>
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      placeholder="e.g. Shop 12, MG Road, Pune, Maharashtra"
                      style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>

                  {/* Phone — new field */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      📞 Contact Number <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                    <Database size={16} /> Submit to Resource Engine
                  </button>
                </form>
              </div>
            ) : (
              <div className="glass" style={{ padding: '2.5rem', textAlign: 'center' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
                  <Lock size={24} color="var(--brand-warning)" />
                </div>
                <h3 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Want to add supplies?</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  Register as a Pharmacy Volunteer to log and manage supply inventory with your address.
                </p>
                <a href="/pharmacy/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: '10px', background: 'linear-gradient(135deg, var(--brand-primary), #1d4ed8)', color: 'white', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}>
                  <Truck size={16} /> Login as Pharmacy Volunteer
                </a>
              </div>
            )}
          </div>

          {/* Info panel on right */}
          <div style={{ flex: '1 1 280px' }}>
            <div className="glass" style={{ padding: '1.5rem', borderRadius: '18px' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={18} color="var(--brand-success)" /> How it works
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[
                  { icon: '📝', title: 'Log your inventory', desc: 'Pharmacy volunteers add medicines, address, and quantity they have available.' },
                  { icon: '🔍', title: 'Citizens search', desc: 'Anyone in need can search for a medicine by name and find the nearest pharmacy.' },
                  { icon: '🗺️', title: 'Get Directions', desc: 'One tap opens Google Maps with a route from your current location to the pharmacy.' },
                  { icon: '✅', title: 'Community verified', desc: 'Other volunteers confirm if inventory is still accurate, building confidence scores.' },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{s.icon}</span>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'white', margin: '0 0 0.2rem' }}>{s.title}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PharmacyNGO() {
  return (
    <Suspense fallback={<div className="container" style={{ paddingTop: '4rem', textAlign: 'center' }}>Loading Portal...</div>}>
      <PharmacyNGOContent />
    </Suspense>
  );
}