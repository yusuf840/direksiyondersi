import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const env = import.meta.env
const useEmulators = env.VITE_USE_EMULATORS === '1'

export const APP_NAME = env.VITE_APP_NAME || 'Randevu'
export const isConfigured = useEmulators || Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID)

export const app = initializeApp(useEmulators
  ? { apiKey: 'demo-key', projectId: 'demo-randevu', appId: 'demo', authDomain: 'localhost' }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY || 'x',
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: env.VITE_FIREBASE_PROJECT_ID || 'x',
      appId: env.VITE_FIREBASE_APP_ID || 'x',
    })

export const auth = getAuth(app)
auth.languageCode = 'tr'
export const db = getFirestore(app)

if (useEmulators) {
  const host = env.VITE_EMULATOR_HOST || '127.0.0.1'
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  // Sadece yerel test (emülatör) derlemesi: Google penceresi açmadan sahte Google hesabıyla giriş
  ;(window as unknown as Record<string, unknown>).__emuGoogleSignIn = (name: string) =>
    signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: name, email: `${name}@ornek.com`, email_verified: true, name })))
}
