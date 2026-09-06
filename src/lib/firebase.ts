import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  signOut as fbSignOut,
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Use the dedicated firestoreDatabaseId if configured in the applet config
export const db: Firestore = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export const signInWithGoogle = async (): Promise<User> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    // Handle blocked popups gracefully in iframe sandboxes
    if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request') {
      console.warn('Popup blocked, falling back to redirect auth flow');
      await signInWithRedirect(auth, googleProvider);
      throw new Error('Redirecting to Google sign-in...');
    }
    throw error;
  }
};

export const signOut = async (): Promise<void> => {
  await fbSignOut(auth);
};

export { onAuthStateChanged };
export type { User };
