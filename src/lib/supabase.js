import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// 환경변수가 설정돼 있으면 Supabase, 아니면 null → localStorage 폴백
export const supabase = url && anon ? createClient(url, anon) : null

const LS_KEY = 'matjip_bookmarks'

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

// 북마크된 맛집 id 목록을 반환
export async function getBookmarks() {
  if (!supabase) return lsGet()
  const { data, error } = await supabase.from('bookmarks').select('place_id')
  if (error) return lsGet()
  return data.map((d) => d.place_id)
}

// 북마크 토글. 토글 후의 전체 id 목록을 반환
export async function toggleBookmark(placeId) {
  if (!supabase) {
    const cur = lsGet()
    const next = cur.includes(placeId) ? cur.filter((x) => x !== placeId) : [...cur, placeId]
    lsSet(next)
    return next
  }
  const existing = await getBookmarks()
  if (existing.includes(placeId)) {
    await supabase.from('bookmarks').delete().eq('place_id', placeId)
  } else {
    await supabase.from('bookmarks').insert({ place_id: placeId })
  }
  return getBookmarks()
}
