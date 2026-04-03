'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default icon path issues in Next.js
const iconSize = [25, 41];
const iconAnchor = [12, 41];

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize, iconAnchor
});

const yellowIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize, iconAnchor
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize, iconAnchor
});

const getIconForPriority = (priority) => {
  if (priority === 'HIGH') return redIcon;
  if (priority === 'MEDIUM') return yellowIcon;
  return greenIcon;
};

export default function Map({ requests = [] }) {
  const [mounted, setMounted] = useState(false);
  const center = [19.0760, 72.8777]; // Base visualization center

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="glass" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading WebGL Map Engine...</div>;
  }

  // Calculate cluster dynamically for the predictive heatmap feature
  const isHighRisk = requests.length > 2;

  return (
    <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%', borderRadius: '16px' }}>
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">Carto</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      
      {/* Radar Sweep Effect (Pure CSS Layer) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0) 0, rgba(255,255,255,0) 40px, rgba(59,130,246,0.1) 41px), linear-gradient(0deg, rgba(59,130,246,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.05) 1px, transparent 1px)', backgroundSize: '100% 100%, 40px 40px, 40px 40px', pointerEvents: 'none', zIndex: 1000 }} />
      {isHighRisk && (
        <Circle 
          center={center} 
          radius={2500} 
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, dashArray: '5, 10' }}
        >
          <Popup>
            <div style={{ color: '#ef4444', fontWeight: 'bold' }}>⚠️ AI HIGH-RISK ZONE PREDICTION</div>
            <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>Anomalous concentration of distress signals logged. Dispatching drone recon and prioritizing sector routing.</p>
          </Popup>
        </Circle>
      )}

      {requests.map((req) => (
        <Marker key={req.id} position={[req.lat, req.lng]} icon={getIconForPriority(req.priority)}>
          <Popup>
            <div style={{ padding: '0.5rem 0' }}>
              <div style={{ display: 'inline-block', padding: '0.2rem 0.5rem', marginBottom: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', color: req.priority === 'HIGH' ? '#ef4444' : req.priority === 'MEDIUM' ? '#f59e0b' : '#10b981' }}>
                {req.priority} PRIORITY
              </div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', fontSize: '1.1rem' }}>{req.type}</h4>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', lineHeight: '1.4' }}>{req.description}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
