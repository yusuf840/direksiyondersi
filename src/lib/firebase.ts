import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

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
// Cloud Functions bölgesi: functions/src/index.ts içindeki setGlobalOptions ile aynı olmalı
export const fns = getFunctions(app, 'europe-west1')

if (useEmulators) {
  const host = env.VITE_EMULATOR_HOST || '127.0.0.1'
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  connectFunctionsEmulator(fns, host, 5001)
  auth.settings.appVerificationDisabledForTesting = true
}
