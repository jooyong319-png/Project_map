import { MOCK } from '../data/mockRestaurants'

// 맛집 데이터를 가져온다.
// 1) /api/places (Google Places 프록시) 시도
// 2) 실패하거나 키가 없으면 목 데이터로 폴백 (검색어로 로컬 필터링)
export async function getRestaurants(query = '', opts = {}) {
  const base = query.trim()
  const cat = opts.category && opts.category !== '전체' ? opts.category : ''
  // 카테고리는 검색어에 녹여서 그 종류로 검색되게 한다
  let q = base
  if (cat) q = base ? `${cat} ${base}` : `${cat} 맛집`
  if (!q) q = '전국 맛집'
  try {
    const params = new URLSearchParams({ q })
    if (opts.bbox) params.set('bbox', opts.bbox.join(','))
    if (opts.openNow) params.set('open', '1') // 영업 중만 (구글 API openNow)
    const res = await fetch(`/api/places?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      if (!data.fallback && Array.isArray(data.places) && data.places.length > 0) {
        return { items: data.places, source: 'google' }
      }
    }
  } catch (_) {
    // 네트워크 오류 → 폴백
  }
  // 폴백: 목 데이터에 카테고리/검색어 로컬 필터
  let items = MOCK
  if (cat) items = items.filter((d) => d.cat === cat)
  if (base) items = items.filter((d) => (d.name + d.region + d.cat).toLowerCase().includes(base.toLowerCase()))
  return { items, source: 'mock' }
}
