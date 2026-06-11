import { MOCK } from '../data/mockRestaurants'

// 맛집 데이터를 가져온다.
// 1) /api/places (Google Places 프록시) 시도
// 2) 실패하거나 키가 없으면 목 데이터로 폴백 (검색어로 로컬 필터링)
export async function getRestaurants(query = '', opts = {}) {
  const base = query.trim()
  const cat = opts.category && opts.category !== '전체' ? opts.category : ''
  // 키워드/카테고리를 따로 보내고, 실제 검색어 변환은 서버에서(전 세계 통하게)
  try {
    const params = new URLSearchParams()
    if (base) params.set('q', base)
    if (cat) params.set('cat', cat)
    if (opts.bbox) params.set('bbox', opts.bbox.join(','))
    if (opts.global) params.set('global', '1') // 전세계 검색(지역 제한 없음)
    if (opts.openNow) params.set('open', '1') // 영업 중만 (구글 API openNow)
    const res = await fetch(`/api/places?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      // 키가 있으면(=fallback 아님) 실제 결과를 그대로 반환. 0개면 빈 목록(목 데이터 안 씀).
      if (!data.fallback) {
        return { items: Array.isArray(data.places) ? data.places : [], source: 'google' }
      }
    }
  } catch (_) {
    // 네트워크 오류 → 폴백
  }
  // 여기 도달 = 키 없음(fallback) 또는 네트워크 오류 → 목 데이터로 데모
  let items = MOCK
  if (cat) items = items.filter((d) => d.cat === cat)
  if (base) items = items.filter((d) => (d.name + d.region + d.cat).toLowerCase().includes(base.toLowerCase()))
  return { items, source: 'mock' }
}
