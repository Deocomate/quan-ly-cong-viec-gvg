import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, db, type Session } from '../lib/backend'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  profileError: string | null
  isAdmin: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      return
    }
    const { data, error } = await db().from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    if (error) setProfileError(error.message)
    else setProfileError(null)
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    let active = true
    auth
      .restore()
      .catch(() => null)
      .then(async (restored) => {
        if (!active) return
        setSession(restored)
        await loadProfile(restored)
        setLoading(false)
      })
    const unsubscribe = auth.subscribe((s) => {
      setSession(s)
      void loadProfile(s)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [loadProfile])

  const value: AuthState = {
    session,
    profile,
    loading,
    profileError,
    isAdmin: profile?.role === 'admin' && profile.is_active,
    signOut: async () => {
      await auth.signOut()
      setProfile(null)
    },
    refreshProfile: () => loadProfile(session),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider')
  return ctx
}

/** Hồ sơ người dùng đã đăng nhập (chỉ dùng trong các trang yêu cầu đăng nhập). */
export function useMe(): Profile {
  const { profile } = useAuth()
  if (!profile) throw new Error('Chưa đăng nhập')
  return profile
}
