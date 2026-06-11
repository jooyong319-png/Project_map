// Vercel 서버리스 함수 - Kakao 로컬 API 프록시 (한국 맛집용)
// 브라우저에서 GET /api/kakao?bbox=서,남,동,북[&q=키워드] 로 호출.
// KAKAO_REST_KEY 가 없으면 fallback:true 를 반환해 프런트엔드가 구글로 폴백하게 합니다.
// 카카오는 평점/리뷰/사진을 제공하지 않으므로 해당 필드는 비우고 place_url(카카오맵 링크)을 제공.

export const ICON_BY_CAT = { 한식: '🍲', 고기: '🍖', 횟집: '🐟', 면: '🍜', 카페: '☕', 기타: '🍽️' }
export const PALETTE = ['#f3a86b', '#9bcf8a', '#7cb6e8', '#e98f8f', '#c9a3e0', '#e0a35c', '#8fc8a0']

const PRICE = { PRICE_LEVEL_INEXPENSIVE: '₩', PRICE_LEVEL_MODERATE: '₩₩', PRICE_LEVEL_EXPENSIVE: '₩₩₩', PRICE_LEVEL_VERY_EXPENSIVE: '₩₩₩₩' }

// 카카오 category_name("음식점 > 한식 > 국밥") → 앱 카테고리
export function catFromKakao(name = '') {
  if (/카페|커피|디저트|베이커리|제과|빵/.test(name)) return '카페'
  if (/고기|육류|구이|삼겹|갈비|곱창|막창|족발|보쌈|닭/.test(name)) return '고기'
  if (/회|해물|수산|일식|초밥|스시|장어/.test(name)) return '횟집'
  if (/면|국수|냉면|칼국수|라멘|우동|파스타|쌀국수/.test(name)) return '면'
  if (/한식|분식|국밥|찌개|백반|한정식|죽/.test(name)) return '한식'
  return '기타'
}

import { cachedEnrich } from './gcache.js'
import { seedByIds } from './store.js'

// 카카오 가게를 구글에 이름+좌표로 매칭해 평점·사진을 가져온다 (표시용).
// (구글 키 있을 때만, 좌표가 ~300m 내로 맞을 때만 채택)
// 태그는 네이버 블로그(api/naver.js)로 따로 판정한다 — 여긴 평점·사진만.
export async function enrichWithGoogle(item, gkey) {
  try {
    const body = {
      textQuery: item.name,
      languageCode: 'ko',
      maxResultCount: 1,
      locationBias: { circle: { center: { latitude: item.lat, longitude: item.lng }, radius: 200 } },
    }
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': gkey,
        'X-Goog-FieldMask': 'places.id,places.rating,places.userRatingCount,places.priceLevel,places.photos,places.location',
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) return item
    const d = await r.json()
    const g = d.places?.[0]
    if (!g?.location) return item
    // 좌표 근접 확인(다른 가게 잘못 매칭 방지)
    if (Math.abs(g.location.latitude - item.lat) > 0.003 || Math.abs(g.location.longitude - item.lng) > 0.003) return item
    const photoRef = g.photos?.[0]?.name
    return {
      ...item,
      gid: g.id || null,
      rating: g.rating || 0,
      reviews: g.userRatingCount || 0,
      price: PRICE[g.priceLevel] || item.price,
      priceLevel: PRICE[g.priceLevel] ? PRICE[g.priceLevel].length : 0,
      photo: photoRef ? `/api/photo?ref=${encodeURIComponent(photoRef)}&w=200` : item.photo,
    }
  } catch (_) {
    return item
  }
}

export default async function handler(req, res) {
  const key = process.env.KAKAO_REST_KEY
  if (!key) {
    res.status(200).json({ places: [], fallback: true })
    return
  }
  const kw = (req.query?.q || '').toString().trim()
  const bbox = (req.query?.bbox || '').toString()
  let rect = ''
  if (bbox) {
    const [w, s, e, n] = bbox.split(',').map(Number)
    if ([w, s, e, n].every(Number.isFinite)) rect = `${w},${s},${e},${n}` // 좌하단 X,Y → 우상단 X,Y
  }
  // 영역(rect) 없고 키워드도 없으면 검색 불가
  if (!rect && !kw) { res.status(200).json({ places: [] }); return }

  const isKeyword = !!kw
  const base = isKeyword
    ? 'https://dapi.kakao.com/v2/local/search/keyword.json'
    : 'https://dapi.kakao.com/v2/local/search/category.json'
  const common = { category_group_code: 'FD6', size: '15' } // FD6 = 음식점
  if (rect) common.rect = rect
  if (isKeyword) common.query = kw

  const headers = { Authorization: `KakaoAK ${key}` }
  try {
    // 최대 3페이지(45곳)까지 병렬 수집
    const pages = await Promise.all([1, 2, 3].map(async (page) => {
      const qs = new URLSearchParams({ ...common, page: String(page) })
      const r = await fetch(`${base}?${qs.toString()}`, { headers })
      if (!r.ok) return []
      const d = await r.json()
      return d.documents || []
    }))
    const seen = new Set()
    const raw = []
    for (const doc of pages.flat()) {
      if (doc.id && !seen.has(doc.id)) { seen.add(doc.id); raw.push(doc) }
    }
    let places = raw.map((p, i) => {
      const c = catFromKakao(p.category_name)
      return {
        id: 'k_' + p.id,
        name: p.place_name || '이름 없음',
        region: p.road_address_name || p.address_name || '',
        cat: c,
        price: '',
        rating: 0,
        reviews: 0,
        lng: Number(p.x),
        lat: Number(p.y),
        color: PALETTE[i % PALETTE.length],
        icon: ICON_BY_CAT[c],
        photo: null,
        priceLevel: 0,
        openNow: null,
        reviews_list: [],
        phone: p.phone || '',
        place_url: p.place_url || '',
        gid: null,
        source: 'kakao',
      }
    })

    // 이미 분석된(시드/DB에 있는) 가게는 태그·블로그수 붙이기 — 일반 검색에도 태그 표시
    try {
      const known = await seedByIds(places.map((p) => p.id))
      places = places.map((p) => (known[p.id] ? { ...p, tags: known[p.id].tags, blog: known[p.id].blog } : p))
    } catch (_) {}

    // 구글 보강: 보여줄 상위 N개에 평점·리뷰·사진 채우기 (캐시 우선, 14일 지난 것만 재호출)
    const gkey = process.env.GOOGLE_PLACES_API_KEY
    const enrichN = Math.min(Math.max(parseInt(req.query?.enrich, 10) || 0, 0), 45)
    if (gkey && enrichN > 0) places = await cachedEnrich(places, enrichN, (it) => enrichWithGoogle(it, gkey))

    res.status(200).json({ places })
  } catch (e) {
    res.status(200).json({ places: [], error: String(e) })
  }
}
