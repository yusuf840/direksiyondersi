import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from './supabase'

interface Profile { id: string; full_name: string | null; phone: string | null }
interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>(null as unknown as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(isConfigured)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('id, full_name, phone').eq('id', s.user.id).maybeSingle()
    setProfile(data ?? { id: s.user.id, full_name: null, phone: s.user.phone ? '+' + s.user.phone.replace('+', '') : null })
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void loadProfile(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const value: AuthState = {
    session, profile, loading,
    refreshProfile: () => loadProfile(session),
    signOut: async () => { await supabase.auth.signOut(); setProfile(null) },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
