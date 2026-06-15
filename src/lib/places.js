import { MOCK } from '../data/mockRestaurants'

// 한국 영역인지(대략) — 한국은 카카오, 그 외는 구글을 쓴다(구글은 한국 맛집 데이터가 약함).
function isKorea(lat, lng) {
  return lng >= 124.5 && lng <= 131.5 && lat >= 33 && lat <= 39
}

// 큐레이션(화제의 맛집) — 시드 목록을 카카오로 좌표 찾고 구글로 평점·사진 보강해 반환
export async function getCuration(tag = '') {
  try {
    const params = new URLSearchParams()
    if (tag) params.set('tag', tag)
    const res = await fetch(`/api/curation?${params.toString()}`)
    if (res.ok) {
      const d = await res.json()
      if (!d.fallback) return { items: Array.isArray(d.places) ? d.places : [], source: 'kakao' }
    }
  } catch (_) {}
  return { items: [], source: 'mock' }
}

// AI 코스 짜기 — 지도 영역(bbox)+테마, 또는 즐겨찾기 후보(candidates)로 하루 동선을 받아온다.
export async function getCourse(bbox, theme = '', candidates = null) {
  try {
    if (candidates) {
      // 즐겨찾기 참고 → POST 로 지역 bbox + 저장목록 함께 전달
      const res = await fetch('/api/course', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bbox: bbox || null, candidates, theme }),
      })
      if (res.ok) return (await res.json()).course || null
      return null
    }
    const t = theme ? `&theme=${encodeURIComponent(theme)}` : ''
    const res = await fetch(`/api/course?bbox=${bbox.join(',')}${t}`)
    if (res.ok) return (await res.json()).course || null
  } catch (_) {}
  return null
}

// 맛집 데이터를 가져온다.
// 1) 한국 영역(bbox) → /api/kakao (카카오 로컬), 그 외 → /api/places (구글)
// 2) 카카오 키가 없으면(fallback) 구글로, 구글도 없으면 목 데이터로 폴백
export async function getRestaurants(query = '', opts = {}) {
  const base = query.trim()
  const cat = opts.category && opts.category !== '전체' ? opts.category : ''
  const bbox = opts.bbox
  const tags = Array.isArray(opts.tags) ? opts.tags.filter(Boolean) : []
  const kind = opts.kind || 'food'

  // 태그 필터 선택 시 → 저장된 시드에서 검색
  if (tags.length) {
    try {
      const p = new URLSearchParams()
      p.set('tags', tags.join(','))
      p.set('kind', kind)
      if (bbox) p.set('bbox', bbox.join(','))
      if (opts.limit) p.set('enrich', String(opts.limit))
      const res = await fetch(`/api/seed?${p.toString()}`)
      if (res.ok) {
        const data = await res.json()
        return { items: Array.isArray(data.places) ? data.places : [], source: 'seed' }
      }
    } catch (_) {}
    return { items: [], source: 'seed' }
  }

  const useKakao = Array.isArray(bbox) && isKorea((bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2)
  const endpoints = useKakao ? ['/api/kakao', '/api/places'] : ['/api/places']
  // 키워드/카테고리를 따로 보내고, 실제 검색어 변환은 서버에서(전 세계 통하게)
  try {
    const params = new URLSearchParams()
    if (base) params.set('q', base)
    if (cat) params.set('cat', cat)
    if (kind && kind !== 'food') params.set('kind', kind)
    if (bbox) params.set('bbox', bbox.join(','))
    if (opts.global) params.set('global', '1') // 전세계 검색(지역 제한 없음)
    if (opts.openNow) params.set('open', '1') // 영업 중만 (구글 API openNow)
    if (opts.oldschool) params.set('oldschool', '1') // 노포(오래된 가게)만 — 카카오 한정
    if (useKakao && opts.limit) {
      params.set('lim', String(opts.limit)) // 격자로 모을 목표 개수(50/100/200)
      params.set('enrich', String(Math.min(opts.limit, 60))) // 구글 보강은 비용상 상위 60개로 제한
    }
    for (const ep of endpoints) {
      const res = await fetch(`${ep}?${params.toString()}`)
      if (!res.ok) continue
      const data = await res.json()
      if (data.fallback) continue // 키 없음 → 다음 소스로
      const items = Array.isArray(data.places) ? data.places : []
      return { items, source: items[0]?.source || 'google', center: data.center || null } // center: 지역검색 시 지도 이동용
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
