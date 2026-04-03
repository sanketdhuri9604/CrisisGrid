import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, browserSessionPersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const hasConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
let app = null;
let authInstance = null;

if (typeof window !== 'undefined' && hasConfig) {
  // 🔥 AUTOCLEAR GHOST DATA: Programmatically wipe the old global IndexedDB tokens 
  // so the user doesn't have to manually press F12 and delete it.
  try {
    window.indexedDB.deleteDatabase('firebaseLocalStorageDb');
  } catch(e) {}

  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    // Explicitly enforce session-only auth BEFORE it ever touches any DB
    authInstance = initializeAuth(app, { persistence: browserSessionPersistence });
  } else {
    app = getApps()[0];
    authInstance = getAuth(app);
  }
} else if (hasConfig) {
  // Server-side fallback
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const db = app ? getFirestore(app) : null;