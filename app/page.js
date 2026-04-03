import Link from 'next/link';
import { AlertCircle, UserCheck, LayoutDashboard, Radio, HeartPulse, BriefcaseMedical } from 'lucide-react';

export default function Home() {
  return (
    <div className="container" style={{ paddingTop: '4rem', paddingBottom: '4rem' }}>
      
      {/* Hero Section */}
      <section className="animate-fade-in" style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: '300px', height: '300px', background: 'var(--brand-danger)', filter: 'blur(150px)', opacity: 0.15, zIndex: -1 }}></div>
        
        <div className="glass delay-1 animate-slide-up" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '50px', marginBottom: '2rem', border: '1px solid var(--brand-danger)' }}>
          <Radio size={16} color="var(--brand-danger)" />
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-danger)' }}>Live: Offline-First Sync Active</span>
        </div>

        <h1 className="delay-2 animate-slide-up" style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: '1.5rem', letterSpacing: '-1px' }}>
          When networks fail, <br />
          <span className="text-gradient">CrisisGrid</span> coordinates help.
        </h1>
        
        <p className="delay-3 animate-slide-up" style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', marginBottom: '3rem', maxWidth: '600px', margin: '0 auto 3rem auto', lineHeight: 1.6 }}>
          Offline-first AI-powered coordination platform for disasters, medical emergencies, and supply shortages.
        </p>

        <div className="delay-4 animate-slide-up flex items-center justify-center gap-4" style={{ flexWrap: 'wrap' }}>
          <Link href="/sos" className="btn btn-primary">
            <AlertCircle size={20} /> Send SOS
          </Link>
          <Link href="/volunteer" className="btn btn-secondary">
            <UserCheck size={20} /> App: Field Agent
          </Link>
          <Link href="/dashboard" className="btn btn-secondary" style={{ border: '1px solid rgba(239, 68, 68, 0.4)', color: 'var(--brand-danger)' }}>
            <LayoutDashboard size={20} /> Command Center
          </Link>
          <Link href="/pharmacy" className="btn btn-secondary" style={{ border: '1px solid rgba(59, 130, 246, 0.4)', color: 'var(--brand-primary)' }}>
            <BriefcaseMedical size={20} /> NGO Portal
          </Link>
        </div>
      </section>

      {/* Live Counters */}
      <section className="animate-fade-in delay-4" style={{ marginTop: '6rem' }}>
        <div className="flex" style={{ flexWrap: 'wrap', gap: '2rem', justifyContent: 'center' }}>
          {[
            { label: 'Requests Resolved', value: '4,289', icon: HeartPulse, color: 'var(--brand-success)' },
            { label: 'Active Volunteers', value: '1,054', icon: UserCheck, color: 'var(--brand-primary)' },
            { label: 'Zones Covered', value: '38', icon: LayoutDashboard, color: 'var(--brand-warning)' },
          ].map((stat, i) => (
            <div key={i} className="glass" style={{ padding: '2rem', flex: '1 1 250px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
              <stat.icon size={32} color={stat.color} style={{ marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{stat.value}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Core Use Cases */}
      <section className="animate-fade-in" style={{ marginTop: '8rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '3rem' }}>Supported Response Modes</h2>
        <div className="flex" style={{ flexWrap: 'wrap', gap: '2rem', justifyContent: 'center' }}>
          {[
            { title: 'Disaster Relief', desc: 'Coordinate shelters and rescue teams during floods, earthquakes, and storms.' },
            { title: 'Medical Emergencies', desc: 'Secure blood, oxygen, and ambulance tracking in real-time.' },
            { title: 'Supply Shortages', desc: 'Map available pharmacies and distribution of basic food amenities.' },
          ].map((useCase, i) => (
            <div key={i} className="glass" style={{ padding: '2rem', flex: '1 1 300px', textAlign: 'left' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <BriefcaseMedical size={24} color="var(--text-primary)" />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>{useCase.title}</h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{useCase.desc}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
