import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updatePassword
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppletConfig from '../firebase-applet-config.json';

// Support both environment variables (Vercel) and the config file
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_API_KEY !== "") ? import.meta.env.VITE_FIREBASE_API_KEY : firebaseAppletConfig.apiKey,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN !== "") ? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN : firebaseAppletConfig.authDomain,
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_PROJECT_ID !== "") ? import.meta.env.VITE_FIREBASE_PROJECT_ID : firebaseAppletConfig.projectId,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET && import.meta.env.VITE_FIREBASE_STORAGE_BUCKET !== "") ? import.meta.env.VITE_FIREBASE_STORAGE_BUCKET : firebaseAppletConfig.storageBucket,
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID && import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID !== "") ? import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID : firebaseAppletConfig.messagingSenderId,
  appId: (import.meta.env.VITE_FIREBASE_APP_ID && import.meta.env.VITE_FIREBASE_APP_ID !== "") ? import.meta.env.VITE_FIREBASE_APP_ID : firebaseAppletConfig.appId,
};

const databaseId = (import.meta.env.VITE_FIREBASE_DATABASE_ID && import.meta.env.VITE_FIREBASE_DATABASE_ID !== "") 
  ? import.meta.env.VITE_FIREBASE_DATABASE_ID 
  : firebaseAppletConfig.firestoreDatabaseId;

const app = initializeApp(firebaseConfig);

// Initialize Firestore with a fallback mechanism
let firestoreDb;
try {
  if (databaseId && databaseId !== "(default)") {
    firestoreDb = getFirestore(app, databaseId);
  } else {
    firestoreDb = getFirestore(app);
  }
} catch (e) {
  console.error("Failed to initialize Firestore with databaseId:", databaseId, e);
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const auth = getAuth(app);

// Initialize Storage with a fallback mechanism
let storageInstance;
try {
  storageInstance = getStorage(app);
} catch (e) {
  console.warn("Firebase Storage is not available. Image uploads will be disabled.", e);
  storageInstance = null;
}

export const storage = storageInstance;
export const googleProvider = new GoogleAuthProvider();
export { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updatePassword 
};
