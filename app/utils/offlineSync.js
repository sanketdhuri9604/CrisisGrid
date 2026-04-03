import { openDB } from 'idb';
import { supabase } from './supabaseClient';

const DB_NAME = 'crisisgrid-offline';
const STORE_NAME = 'sos-queue';

export async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

export async function transmitSOS(requestData) {
  const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

  const demoPayload = {
    ...requestData,
    id: `req-${Date.now()}`,
    timestamp: 'Just now',
    distance: '0.0 km',
  };

  // Add to localstorage for the dashboard to read in real-time (Demo Hack)
  if (typeof window !== 'undefined') {
    const existing = JSON.parse(localStorage.getItem('local_sos_requests') || '[]');
    localStorage.setItem('local_sos_requests', JSON.stringify([demoPayload, ...existing]));
    // Dispath event so dashboard updates without refresh
    window.dispatchEvent(new Event('sos-updated'));
  }

  if (isOnline && supabase) {
    try {
      const { data, error } = await supabase.from('sos_requests').insert([demoPayload]).select();
      if (error) throw error;
      return { status: 'synced', platform: 'Supabase Cloud', data };
    } catch (err) {
      console.error('🔥 Supabase Sync Error:', err.message || err);
      console.warn('Failing over to local storage due to the error above.');
    }
  }

  const db = await initDB();
  await db.add(STORE_NAME, { 
    ...demoPayload, 
    _localTimestamp: new Date().toISOString() 
  });
  
  return { 
    status: 'queued', 
    platform: 'IndexedDB (Offline Fallback)',
    message: 'Data secured locally.' 
  };
}

export async function processOfflineQueue() {
  if (!supabase || typeof navigator === 'undefined' || !navigator.onLine) return;
  const db = await initDB();
  const queue = await db.getAll(STORE_NAME);
  if (queue.length === 0) return;

  for (const record of queue) {
    try {
      const { id, _localTimestamp, ...payload } = record;
      const { error } = await supabase.from('sos_requests').insert([payload]);
      if (!error) await db.delete(STORE_NAME, id);
    } catch (err) {}
  }
}
