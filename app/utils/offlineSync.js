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
  const localId = `req-${Date.now()}`;

  // Save to localStorage for instant local UI (with unique id for cleanup later)
  const localPayload = {
    ...requestData,
    id: localId,
    timestamp: new Date().toLocaleTimeString(),
    distance: '0.0 km',
  };

  if (typeof window !== 'undefined') {
    const existing = JSON.parse(localStorage.getItem('local_sos_requests') || '[]');
    localStorage.setItem('local_sos_requests', JSON.stringify([localPayload, ...existing]));
    window.dispatchEvent(new Event('sos-updated'));
  }

  // Try to sync to Firebase
  if (isOnline && db) {
    try {
      const docRef = await addDoc(collection(db, 'sos_requests'), {
        ...requestData,
        created_at: new Date().toISOString(),
      });

      // ✅ FIX: Remove from localStorage since Firestore is now the source of truth
      if (typeof window !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('local_sos_requests') || '[]');
        const cleaned = existing.filter(r => r.id !== localId);
        localStorage.setItem('local_sos_requests', JSON.stringify(cleaned));
        // Notify dashboard to reload (it will now get clean Firestore data)
        window.dispatchEvent(new Event('sos-updated'));
      }

      return { status: 'synced', platform: 'Firebase Firestore', data: { id: docRef.id } };
    } catch (err) {
      console.error('🔥 Firebase Sync Error:', err.message);
    }
  }

  // Offline fallback: queue in IndexedDB
  const idb = await initDB();
  await idb.add(STORE_NAME, {
    ...requestData,
    _localId: localId,
    _localTimestamp: new Date().toISOString(),
  });

  return {
    status: 'queued',
    platform: 'IndexedDB (Offline Fallback)',
    message: 'Data secured locally. Will sync when online.',
  };
}

export async function processOfflineQueue() {
  if (!db || typeof navigator === 'undefined' || !navigator.onLine) return;
  const idb = await initDB();
  const queue = await idb.getAll(STORE_NAME);
  if (queue.length === 0) return;

  for (const record of queue) {
    try {
      const { id, _localId, _localTimestamp, ...payload } = record;
      await addDoc(collection(db, 'sos_requests'), {
        ...payload,
        created_at: new Date().toISOString(),
      });
      await idb.delete(STORE_NAME, id);

      // Also clean corresponding localStorage entry
      if (typeof window !== 'undefined' && _localId) {
        const existing = JSON.parse(localStorage.getItem('local_sos_requests') || '[]');
        localStorage.setItem('local_sos_requests', JSON.stringify(existing.filter(r => r.id !== _localId)));
      }
    } catch (err) {
      console.error('Queue sync error:', err.message);
    }
  }

  // Notify UI of queue flush
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('sos-updated'));
}