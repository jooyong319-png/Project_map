import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// 환경변수가 설정돼 있으면 Supabase, 아니면 null → localStorage 폴백
// flowType: 'pkce' — 앱(딥링크)에서 code→세션 교환(exchangeCodeForSession)에 필요.
// 웹에서도 detectSessionInUrl 로 자동 처리되어 동일하게 동작.
export const supabase = url && anon
  ? createClient(url, anon, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } })
  : null

const LS_KEY = 'matjip_saved_v2' // 로그인 전 임시 저장(로그인 시 계정으로 병합)

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

// 현재 로그인 유저 id (없으면 null → 즐겨찾기 비활성)
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
  return [] // 비로그인: 즐겨찾기는 로그인 후에만
}

// 저장된 맛집 id 목록 (북마크 표시용)
export async function getBookmarks() {
  const items = await getSavedItems()
  return items.map((d) => d.id)
}

// 북마크 토글. 로그인 유저만 가능(계정 DB). 비로그인은 { needLogin:true } 반환 → UI 가 로그인 유도.
export async function toggleBookmark(data) {
  const id = typeof data === 'string' ? data : data?.id
  if (!id) return getBookmarks()
  const uid = await currentUserId()
  if (!uid) return { needLogin: true } // 즐겨찾기는 로그인 후에만
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

// 즐겨찾기는 이제 로그인 전용이라 게스트 localStorage 병합은 하지 않는다.
// 과거 seedFeatured 로 남은 오래된 로컬 데이터(뚜쥬루 등)가 다시 계정으로 유입되지 않게 정리만.
export async function mergeLocalFavorites() {
  try { localStorage.removeItem(LS_KEY); localStorage.removeItem('matjip_seeded_v2') } catch {}
}
