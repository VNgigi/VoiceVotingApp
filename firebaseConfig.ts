// firebaseConfig.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
   apiKey: "AIzaSyB01HKZf0aUGwKmtP5WndAkPnTgyoHDaxs",
  authDomain: "voicevotingapp-1282.firebaseapp.com",
  projectId: "voicevotingapp-1282",
  storageBucket: "voicevotingapp-1282.firebasestorage.app",
  messagingSenderId: "876681961777",
  appId: "1:876681961777:web:da5534fc7a0750b474d010",
  measurementId: "G-MX3R5GM0TC"
};

// Avoid duplicate app initialization
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export { app };

