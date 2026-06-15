// Vercel 서버리스 함수 - Kakao 로컬 API 프록시 (한국 맛집용)
// 브라우저에서 GET /api/kakao?bbox=서,남,동,북[&q=키워드] 로 호출.
// KAKAO_REST_KEY 가 없으면 fallback:true 를 반환해 프런트엔드가 구글로 폴백하게 합니다.
// 카카오는 평점/리뷰/사진을 제공하지 않으므로 해당 필드는 비우고 place_url(카카오맵 링크)을 제공.

export const ICON_BY_CAT = { 한식: '🍲', 고기: '🍖', 횟집: '🐟', 면: '🍜', 카페: '☕', 기타: '🍽️' }
export const PALETTE = ['#f3a86b', '#9bcf8a', '#7cb6e8', '#e98f8f', '#c9a3e0', '#e0a35c', '#8fc8a0']

// 검색 종류 → 카카오 카테고리 코드. food=음식점, travel=관광명소, stay=숙박
export const KIND_CAT = { food: 'FD6', travel: 'AT4', stay: 'AD5' }
export const KIND_ICON = { food: '🍽️', travel: '📸', stay: '🛏️' }
export const CAT_KIND = { FD6: 'food', AT4: 'travel', AD5: 'stay' }
export function catCodeOf(kind) { return KIND_CAT[kind] || 'FD6' }
export function catsOf(kind) { return kind === 'all' ? ['FD6', 'AT4', 'AD5'] : [catCodeOf(kind)] }

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

// 검색어 앞부분이 지역명(구/동)이면 그 지역 좌표+반경으로 바꾼다. "개봉 전집" → 개봉동으로 이동 + kw='전집'.
//  · 현재 보던 지도영역(bbox)에 갇히지 않게, 지역이 인식되면 그 동네 rect 로 덮어쓴다.
//  · 앞에서부터 최대 3토큰까지 지역 후보로 시도, 가장 긴 매칭 채택("강남구 논현동 파스타" 등).
async function resolveRegion(kw, key) {
  const toks = kw.split(/\s+/).filter(Boolean)
  for (let n = Math.min(3, toks.length); n >= 1; n--) {
    const cand = toks.slice(0, n).join(' ')
    let doc
    try {
      const r = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?size=1&query=${encodeURIComponent(cand)}`, { headers: { Authorization: `KakaoAK ${key}` } })
      if (!r.ok) continue
      doc = (await r.json()).documents?.[0]
    } catch (_) { continue }
    const a = doc?.address
    if (!a || (!a.region_2depth_name && !a.region_3depth_name)) continue
    const dong = a.region_3depth_name || a.region_3depth_h_name || ''
    const d = dong ? 0.02 : a.region_2depth_name ? 0.05 : 0.09 // 동 ~2km / 구 ~5km / 그 외 ~9km
    const lng = Number(doc.x), lat = Number(doc.y)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    return { rect: `${lng - d},${lat - d},${lng + d},${lat + d}`, kw: toks.slice(n).join(' '), center: { lng, lat } }
  }
  return null
}

// 한 사각형(rect)에서 카카오 3페이지(최대 45) 수집.
// full=true → 그 칸의 전체 매칭(total_count)이 45 초과 = 페이지로 못 가져오는 게 있음 → 쪼개야 함.
async function fetchRect(base, params, rect, headers) {
  const out = []
  const seen = new Set()
  let full = false
  for (const page of [1, 2, 3]) {
    const qs = new URLSearchParams({ ...params, rect, page: String(page) })
    const r = await fetch(`${base}?${qs.toString()}`, { headers })
    if (!r.ok) break
    const d = await r.json()
    if (page === 1 && (d.meta?.total_count || 0) > 45) full = true
    for (const doc of d.documents || []) if (doc.id && !seen.has(doc.id)) { seen.add(doc.id); out.push(doc) }
    if (d.meta?.is_end) break
  }
  return { docs: out, full }
}

// 적응형 4분할 격자 — 꽉 찬 칸만 더 쪼개 target 개까지 모은다(카카오 45 한계 우회).
async function gridCollect(base, params, bbox, headers, target, maxDepth = 3) {
  const all = new Map()
  const [W, S, E, N] = bbox.split(',').map(Number)
  async function rec(w, s, e, n, depth) {
    if (all.size >= target) return
    const { docs, full } = await fetchRect(base, params, `${w},${s},${e},${n}`, headers)
    for (const doc of docs) all.set(doc.id, doc)
    if (full && depth < maxDepth && all.size < target) {
      const mx = (w + e) / 2, my = (s + n) / 2
      await rec(w, s, mx, my, depth + 1)
      await rec(mx, s, e, my, depth + 1)
      await rec(w, my, mx, n, depth + 1)
      await rec(mx, my, e, n, depth + 1)
    }
  }
  await rec(W, S, E, N, 0)
  return [...all.values()]
}

export default async function handler(req, res) {
  const key = process.env.KAKAO_REST_KEY
  if (!key) {
    res.status(200).json({ places: [], fallback: true })
    return
  }
  let kw = (req.query?.q || '').toString().trim()
  const bbox = (req.query?.bbox || '').toString()
  let rect = ''
  if (bbox) {
    const [w, s, e, n] = bbox.split(',').map(Number)
    if ([w, s, e, n].every(Number.isFinite)) rect = `${w},${s},${e},${n}` // 좌하단 X,Y → 우상단 X,Y
  }
  // 검색어 앞에 지역명("개봉", "강남구 논현동"…)이 있으면 그 동네로 이동(현재 화면 bbox 무시).
  //  → "개봉 전집"을 강남 화면에서 쳐도 개봉동에서 전집을 찾는다. center 는 클라가 지도 이동에 쓰도록 반환.
  let regionCenter = null
  if (kw) {
    const reg = await resolveRegion(kw, key)
    if (reg) { rect = reg.rect; kw = reg.kw; regionCenter = reg.center }
  }
  // 영역(rect) 없고 키워드도 없으면 검색 불가
  if (!rect && !kw) { res.status(200).json({ places: [] }); return }

  const kind = (req.query?.kind || 'food').toString()
  const cats = catsOf(kind) // food=[FD6], all=[FD6,AT4,AD5] ...
  const isKeyword = !!kw
  const base = isKeyword
    ? 'https://dapi.kakao.com/v2/local/search/keyword.json'
    : 'https://dapi.kakao.com/v2/local/search/category.json'

  const headers = { Authorization: `KakaoAK ${key}` }
  // 모을 목표 개수(격자). lim 으로 50/100/200 까지 진짜 채운다.
  const target = Math.min(Math.max(parseInt(req.query?.lim, 10) || 45, 15), 200)
  try {
    const per = Math.max(15, Math.ceil(target / cats.length))
    const seen = new Set()
    const lists = [] // 카테고리별 결과 (인터리브용)
    for (const cat of cats) {
      let docs = []
      if (rect) {
        const params = { category_group_code: cat, size: '15' }
        if (isKeyword) params.query = kw
        docs = await gridCollect(base, params, rect, headers, per)
      } else {
        const pages = await Promise.all([1, 2, 3].map(async (page) => {
          const qs = new URLSearchParams({ category_group_code: cat, size: '15', page: String(page), ...(isKeyword ? { query: kw } : {}) })
          const r = await fetch(`${base}?${qs.toString()}`, { headers })
          if (!r.ok) return []
          return (await r.json()).documents || []
        }))
        docs = pages.flat()
      }
      const arr = []
      for (const d of docs) if (d.id && !seen.has(d.id)) { seen.add(d.id); arr.push({ ...d, _cat: cat }) }
      lists.push(arr)
    }
    // 라운드로빈 인터리브(전체일 때 음식·여행지·숙소 균형있게 섞임)
    const raw = []
    const maxLen = Math.max(0, ...lists.map((l) => l.length))
    for (let i = 0; i < maxLen; i++) for (const l of lists) if (l[i]) raw.push(l[i])
    let places = raw.map((p, i) => {
      const pk = CAT_KIND[p._cat] || kind // 이 가게의 종류(전체일 때 출처 카테고리 기준)
      const c = pk === 'food' ? catFromKakao(p.category_name) : (p.category_name?.split('>').pop()?.trim() || '')
      const icon = pk === 'food' ? ICON_BY_CAT[c] : KIND_ICON[pk]
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
        icon,
        photo: null,
        priceLevel: 0,
        openNow: null,
        reviews_list: [],
        phone: p.phone || '',
        place_url: p.place_url || '',
        gid: null,
        kind: pk,
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
    const enrichN = Math.min(Math.max(parseInt(req.query?.enrich, 10) || 0, 0), 60)
    if (gkey && enrichN > 0) places = await cachedEnrich(places, enrichN, (it) => enrichWithGoogle(it, gkey))

    res.status(200).json({ places, center: regionCenter }) // center: 지역검색이면 클라가 지도 이동에 사용
  } catch (e) {
    res.status(200).json({ places: [], error: String(e) })
  }
}
