'use client';

import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const iconSize = [25, 41];
const iconAnchor = [12, 41];

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize, iconAnchor,
});
const yellowIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize, iconAnchor,
});
const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize, iconAnchor,
});

const getIconForPriority = (priority) => {
  if (priority === 'HIGH') return redIcon;
  if (priority === 'MEDIUM') return yellowIcon;
  return greenIcon;
};

export default function Map({ requests = [] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Calculate centroid of all valid SOS locations (not hardcoded Mumbai anymore)
  const safeRequests = useMemo(
    () => requests.filter((req) => Number.isFinite(Number(req.lat)) && Number.isFinite(Number(req.lng))),
    [requests]
  );

  const center = useMemo(() => {
    if (safeRequests.length === 0) return [19.076, 72.8777]; // fallback: Mumbai
    const avgLat = safeRequests.reduce((s, r) => s + Number(r.lat), 0) / safeRequests.length;
    const avgLng = safeRequests.reduce((s, r) => s + Number(r.lng), 0) / safeRequests.length;
    return [avgLat, avgLng];
  }, [safeRequests]);

  const isHighRisk = requests.filter(r => r.status === 'pending').length > 2;

  if (!mounted) {
    return (
      <div className="glass" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading Map Engine...
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {/* Overlay grid */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(0deg, rgba(59,130,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none', zIndex: 1000,
      }} />
      <MapContainer center={center} zoom={safeRequests.length > 0 ? 12 : 10} style={{ height: '100%', width: '100%', borderRadius: '16px' }}>
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">Carto</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {isHighRisk && (
          <Circle
            center={center}
            radius={2500}
            pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.12, dashArray: '5, 10' }}
          >
            <Popup>⚠️ High Risk Cluster — {requests.filter(r => r.status === 'pending').length} pending SOS</Popup>
          </Circle>
        )}
        {safeRequests.map((req) => (
          <Marker key={req.id} position={[Number(req.lat), Number(req.lng)]} icon={getIconForPriority(req.priority)}>
            <Popup>
              <div style={{ padding: '0.5rem 0', minWidth: '180px' }}>
                <div style={{ display: 'inline-block', padding: '0.2rem 0.5rem', marginBottom: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', color: req.priority === 'HIGH' ? '#ef4444' : req.priority === 'MEDIUM' ? '#f59e0b' : '#10b981' }}>
                  {req.priority} PRIORITY
                </div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', fontSize: '1rem' }}>{req.type}</h4>
                {req.locationLabel && (
                  <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.82rem', color: '#60a5fa', fontWeight: 600 }}>📍 {req.locationLabel}</p>
                )}
                <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.8rem', color: '#666' }}>Status: {req.status}</p>
                {req.phone && <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'bold' }}>📞 {req.phone}</p>}
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${Number(req.lat)},${Number(req.lng)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: 600, textDecoration: 'none' }}>
                  🗺️ Get Directions →
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}