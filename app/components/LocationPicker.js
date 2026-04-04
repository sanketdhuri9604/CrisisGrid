'use client';

import { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

function MapEvents({ position, setPosition, onLocationChange }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
      if (onLocationChange) {
        onLocationChange(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return position ? <Marker position={position} icon={redIcon} /> : null;
}

export default function LocationPicker({ defaultPosition, onLocationChange }) {
  const [position, setPosition] = useState(defaultPosition || { lat: 19.0760, lng: 72.8777 });

  return (
    <div style={{ height: '300px', width: '100%', borderRadius: '12px', overflow: 'hidden', zIndex: 1 }}>
      <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">Carto</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapEvents position={position} setPosition={setPosition} onLocationChange={onLocationChange} />
      </MapContainer>
      <div style={{ textAlign: 'center', marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        Tap anywhere on the map to pin your exact location.
      </div>
    </div>
  );
}
