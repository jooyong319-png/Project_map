import { createClient } from '@supabase/supabase-js'
import { FEATURED } from '../data/featured.js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// 환경변수가 설정돼 있으면 Supabase, 아니면 null → localStorage 폴백
// flowType: 'pkce' — 앱(딥링크)에서 code→세션 교환(exchangeCodeForSession)에 필요.
// 웹에서도 detectSessionInUrl 로 자동 처리되어 동일하게 동작.
export const supabase = url && anon
  ? createClient(url, anon, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } })
  : null

const LS_KEY = 'matjip_saved_v2' // 이제 id 만이 아니라 맛집 전체 객체를 저장
const SEED_KEY = 'matjip_seeded_v2'

function lsGet() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]')
  } catch {
    return []
  }
}
function lsSet(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr))
}

// 처음 한 번만 주요 맛집을 저장 목록에 자동 추가 (이후 사용자가 지우면 다시 안 넣음)
function seedFeatured() {
  if (localStorage.getItem(SEED_KEY)) return
  const cur = lsGet()
  const have = new Set(cur.map((d) => d.id))
  lsSet([...cur, ...FEATURED.filter((f) => !have.has(f.id))])
  localStorage.setItem(SEED_KEY, '1')
}

// 현재 로그인 유저 id (없으면 null → localStorage 모드)
async function currentUserId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || null
}

// 저장된 맛집 "전체 객체" 목록 — 로그인 유저는 계정 DB(favorites), 게스트는 localStorage
export async function getSavedItems() {
  const uid = await currentUserId()
  if (uid) {
    const { data, error } = await supabase
      .from('favorites').select('data').eq('user_id', uid).order('created_at', { ascending: false })
    if (!error) return (data || []).map((r) => r.data)
    return lsGet() // 테이블 미생성 등 → 로컬 폴백(깨지지 않게)
  }
  seedFeatured()
  return lsGet()
}

// 저장된 맛집 id 목록 (북마크 표시용)
export async function getBookmarks() {
  const items = await getSavedItems()
  return items.map((d) => d.id)
}

// 북마크 토글. 로그인 유저는 계정 DB, 게스트는 localStorage. 토글 후 id 목록 반환.
export async function toggleBookmark(data) {
  const id = typeof data === 'string' ? data : data?.id
  if (!id) return getBookmarks()
  const uid = await currentUserId()
  if (uid) {
    const { data: exist } = await supabase
      .from('favorites').select('place_id').eq('user_id', uid).eq('place_id', id).maybeSingle()
    if (exist) {
      await supabase.from('favorites').delete().eq('user_id', uid).eq('place_id', id)
    } else {
      const obj = typeof data === 'string' ? { id } : data
      await supabase.from('favorites').insert({ user_id: uid, place_id: id, data: obj })
    }
    return getBookmarks()
  }
  // 게스트: localStorage
  const cur = lsGet()
  const next = cur.some((d) => d.id === id)
    ? cur.filter((d) => d.id !== id)
    : [...cur, (typeof data === 'string' ? { id } : data)]
  lsSet(next)
  return next.map((d) => d.id)
}

// 로그인 시: 게스트(localStorage) 즐겨찾기를 계정으로 병합 후 로컬 비움
export async function mergeLocalFavorites() {
  const uid = await currentUserId()
  if (!uid) return
  const local = lsGet()
  if (!local.length) return
  const rows = local.filter((d) => d?.id).map((d) => ({ user_id: uid, place_id: d.id, data: d }))
  const { error } = await supabase.from('favorites').upsert(rows, { onConflict: 'user_id,place_id', ignoreDuplicates: true })
  if (!error) lsSet([]) // 성공 시에만 로컬 비움
}
