import { createClient } from '@supabase/supabase-js'
import { FEATURED } from '../data/featured.js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// 환경변수가 설정돼 있으면 Supabase, 아니면 null → localStorage 폴백
export const supabase = url && anon ? createClient(url, anon) : null

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

// 저장된 맛집 "전체 객체" 목록 (좌표·사진 포함) — 지도/저장목록에서 사용
export async function getSavedItems() {
  seedFeatured()
  return lsGet()
}

// 저장된 맛집 id 목록 (북마크 표시용)
export async function getBookmarks() {
  const items = await getSavedItems()
  return items.map((d) => d.id)
}

// 북마크 토글. 인자는 맛집 객체(또는 id). 토글 후의 id 목록을 반환.
export async function toggleBookmark(data) {
  const id = typeof data === 'string' ? data : data?.id
  if (!id) return getBookmarks()
  const cur = lsGet()
  let next
  if (cur.some((d) => d.id === id)) {
    next = cur.filter((d) => d.id !== id)
  } else {
    const obj = typeof data === 'string' ? { id } : data
    next = [...cur, obj]
  }
  lsSet(next)
  return next.map((d) => d.id)
}
