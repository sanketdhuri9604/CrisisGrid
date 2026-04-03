import { openDB } from 'idb';
import { db } from './firebaseClient';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';

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

  // LocalStorage ke liye (local UI update)
  const localPayload = {
    ...requestData,
    id: `req-${Date.now()}`,
    timestamp: 'Just now',
    distance: '0.0 km',
  };

  if (typeof window !== 'undefined') {
    const existing = JSON.parse(localStorage.getItem('local_sos_requests') || '[]');
    localStorage.setItem('local_sos_requests', JSON.stringify([localPayload, ...existing]));
    window.dispatchEvent(new Event('sos-updated'));
  }

  // Firebase mein bhejo
  if (isOnline && db) {
    try {
      const docRef = await addDoc(collection(db, 'sos_requests'), {
        ...requestData,
        created_at: new Date().toISOString(),
      });
      return { status: 'synced', platform: 'Firebase Firestore', data: { id: docRef.id } };
    } catch (err) {
      console.error('🔥 Firebase Sync Error:', err.message);
    }
  }

  // Offline fallback
  const idb = await initDB();
  await idb.add(STORE_NAME, {
    ...requestData,
    _localTimestamp: new Date().toISOString(),
  });

  return {
    status: 'queued',
    platform: 'IndexedDB (Offline Fallback)',
    message: 'Data secured locally.',
  };
}

export async function processOfflineQueue() {
  if (!db || typeof navigator === 'undefined' || !navigator.onLine) return;
  const idb = await initDB();
  const queue = await idb.getAll(STORE_NAME);
  if (queue.length === 0) return;

  for (const record of queue) {
    try {
      const { id, _localTimestamp, ...payload } = record;
      await addDoc(collection(db, 'sos_requests'), {
        ...payload,
        created_at: new Date().toISOString(),
      });
      await idb.delete(STORE_NAME, id);
    } catch (err) {
      console.error('Queue sync error:', err.message);
    }
  }
}