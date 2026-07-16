import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'

// 로그인 상태 전역 관리 (Supabase Auth). 소셜 로그인은 signIn(provider) 로.
const AuthCtx = createContext({ user: null, loading: true, signIn: () => {}, signOut: () => {} })

// 네이티브(앱) 여부 — 앱이면 외부 브라우저 + 딥링크로 OAuth, 웹이면 기존 리다이렉트.
// 옵션 B(웹뷰가 Vercel 사이트 로드)라도 Capacitor 브릿지가 주입돼 이 값이 참이 된다.
const isNative = Capacitor.isNativePlatform()
const APP_REDIRECT = 'kokkokkok://auth-callback' // AndroidManifest 의 스킴과 일치해야 함

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

  // 앱 전용: OAuth 후 kokkokkok://auth-callback?code=... 로 복귀 → 세션 교환.
  useEffect(() => {
    if (!isNative || !supabase) return
    const handle = CapApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith(APP_REDIRECT)) return
      try {
        const u = new URL(url)
        const code = u.searchParams.get('code')
        const tokenHash = u.searchParams.get('token_hash') // 네이버 커스텀 플로우
        const type = u.searchParams.get('type') || 'magiclink'
        const errd = u.searchParams.get('error_description')
        if (errd) console.warn('[auth] oauth 오류:', errd)
        if (tokenHash) await supabase.auth.verifyOtp({ token_hash: tokenHash, type }) // 네이버: 토큰으로 세션 생성
        else if (code) await supabase.auth.exchangeCodeForSession(code) // 구글·카카오 PKCE (검증자는 앱 웹뷰 저장소)
      } catch (e) {
        console.warn('[auth] 딥링크 처리 실패:', e)
      } finally {
        try { await Browser.close() } catch {}
      }
    })
    return () => { handle.then((h) => h.remove()) }
  }, [])

  // 구글·카카오는 Supabase 네이티브. 네이버는 커스텀 OAuth(/api/auth/naver).
  const signIn = async (provider) => {
    if (!supabase) return

    if (provider === 'naver') {
      // 네이버 커스텀 OAuth. 앱은 native=1 로 서버가 token_hash 딥링크로 복귀시킴
      if (isNative) { await Browser.open({ url: `${window.location.origin}/api/auth/naver/login?native=1` }); return }
      window.location.href = '/api/auth/naver/login'
      return
    }

    if (isNative) {
      // 앱: 외부 브라우저로 열고, 끝나면 딥링크로 복귀 → appUrlOpen 에서 세션 교환
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: APP_REDIRECT, skipBrowserRedirect: true },
      })
      if (error) { console.warn('[auth] signIn 실패:', error); return }
      if (data?.url) await Browser.open({ url: data.url })
      return
    }

    // 웹: 같은 탭 리다이렉트 (기존 동작)
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
  let avatar = m.avatar_url || m.picture || m.profile_image || ''
  // 카카오 프로필 이미지는 http:// 로 오는 경우가 있어 https 페이지(앱)에서 혼합콘텐츠로 차단됨 → https 승격
  if (avatar.startsWith('http://')) avatar = 'https://' + avatar.slice(7)
  return { name, avatar }
}
