import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth'
import { auth, isConfigured } from './firebase'
import { getProfile } from './api'

interface Profile { id: string; full_name: string | null; phone: string | null }
interface AuthState {
  /** Giriş yapmış kullanıcı (telefonla doğrulanmış) */
  session: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>(null as unknown as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(isConfigured)

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) { setProfile(null); return }
    const p = await getProfile(u.uid).catch(() => null)
    setProfile({ id: u.uid, full_name: p?.full_name ?? null, phone: u.phoneNumber })
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      await loadProfile(u)
      setLoading(false)
    })
  }, [loadProfile])

  const value: AuthState = {
    session: user, profile, loading,
    refreshProfile: () => loadProfile(auth.currentUser),
    signOut: async () => { await fbSignOut(auth); setProfile(null) },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
