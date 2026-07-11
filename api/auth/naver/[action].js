// 네이버 로그인 (Supabase 미지원 → 직접 구현). 한 함수로 login·callback 둘 다 처리.
//   /api/auth/naver/login    → 네이버 인증 페이지로 302 (state 쿠키로 CSRF 방지)
//   /api/auth/naver/callback → code→토큰→프로필 → Supabase admin 유저 생성/조회 → magiclink 세션 발급
// (Vercel 동적 라우트 [action].js = 함수 1개. 로컬 vite 는 두 경로를 이 핸들러로 매핑)
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https')
  return `${proto}://${req.headers.host}`
}
function cookieVal(header, name) {
  return (header || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='))?.slice(name.length + 1)
}
function redirect(res, location, cookie) {
  if (cookie) res.setHeader('Set-Cookie', cookie)
  res.statusCode = 302
  res.setHeader('Location', location)
  res.end()
}

// 네이버로 보내기
function login(req, res) {
  const cid = process.env.NAVER_LOGIN_CLIENT_ID
  if (!cid) { res.statusCode = 500; res.end('naver login not configured'); return }
  const redirectUri = `${originOf(req)}/api/auth/naver/callback`
  const state = crypto.randomUUID()
  const u = new URL('https://nid.naver.com/oauth2.0/authorize')
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', cid)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('state', state)
  redirect(res, u.toString(), `nv_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`)
}

// 네이버 콜백
async function callback(req, res) {
  const origin = originOf(req)
  const fail = (reason) => redirect(res, `${origin}/?login_error=${encodeURIComponent(reason)}`)
  try {
    const { code, state } = req.query || {}
    if (!code || !state || state !== cookieVal(req.headers.cookie, 'nv_state')) return fail('state')
    const cid = process.env.NAVER_LOGIN_CLIENT_ID
    const csec = process.env.NAVER_LOGIN_CLIENT_SECRET

    // 1) code → access_token
    const token = await (await fetch(`https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${cid}&client_secret=${csec}&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`)).json()
    if (!token.access_token) return fail('token')

    // 2) 프로필
    const me = await (await fetch('https://openapi.naver.com/v1/nid/me', { headers: { Authorization: `Bearer ${token.access_token}` } })).json()
    const p = me.response || {}
    if (!p.id) return fail('profile')
    const email = p.email || `naver_${p.id}@naver.social`
    const name = p.nickname || p.name || '네이버사용자'

    // 3) Supabase admin: 유저 생성(없으면)
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })
    const meta = { name, full_name: name, avatar_url: p.profile_image || '', provider: 'naver', naver_id: p.id }
    const { error: cErr } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta })
    if (cErr && !/already|exist|registered/i.test(cErr.message)) return fail('user')

    // 4) magiclink 액션링크로 세션 발급
    const { data, error: lErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: origin } })
    if (lErr || !data?.properties?.action_link) return fail('link')
    redirect(res, data.properties.action_link, 'nv_state=; Path=/; Max-Age=0')
  } catch (_) {
    fail('exception')
  }
}

export default function handler(req, res) {
  const action = req.query?.action || req.url.split('?')[0].split('/').pop()
  if (action === 'login') return login(req, res)
  if (action === 'callback') return callback(req, res)
  res.statusCode = 404
  res.end('not found')
}
