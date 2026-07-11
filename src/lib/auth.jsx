import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// 로그인 상태 전역 관리 (Supabase Auth). 소셜 로그인은 signIn(provider) 로.
const AuthCtx = createContext({ user: null, loading: true, signIn: () => {}, signOut: () => {} })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return } // 키 없으면 로그인 비활성
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 구글·카카오는 Supabase 네이티브. 네이버는 별도(추후 /api/auth/naver).
  const signIn = async (provider) => {
    if (!supabase) return
    if (provider === 'naver') { window.location.href = '/api/auth/naver/login'; return }
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })
  }
  const signOut = async () => { if (supabase) await supabase.auth.signOut() }

  return <AuthCtx.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)

// 유저 표시 정보 뽑기 (프로바이더별 메타데이터가 제각각이라 방어적으로)
export function userInfo(user) {
  const m = user?.user_metadata || {}
  const name = m.name || m.full_name || m.nickname || m.user_name || (user?.email ? user.email.split('@')[0] : '사용자')
  const avatar = m.avatar_url || m.picture || m.profile_image || ''
  return { name, avatar }
}
