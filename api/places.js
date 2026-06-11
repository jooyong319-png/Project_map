// Vercel 서버리스 함수 - Google Places API (New) Text Search 프록시
// 브라우저에서 GET /api/places?q=검색어 로 호출.
// GOOGLE_PLACES_API_KEY 가 없으면 fallback:true 를 반환해 프런트엔드가 목 데이터를 쓰게 합니다.

const CAT_BY_TYPE = {
  korean_restaurant: '한식', barbecue_restaurant: '고기', seafood_restaurant: '횟집',
  noodle_shop: '면', ramen_restaurant: '면', cafe: '카페', coffee_shop: '카페',
}
// 카테고리 → 범용(영어) 검색어. 전 세계에서 통하게 한국어 "맛집" 대신 사용.
const CAT_Q = { 한식: 'korean restaurant', 고기: 'korean bbq restaurant', 횟집: 'seafood restaurant', 면: 'noodle restaurant', 카페: 'cafe' }

// 일반(키워드 없는) 검색: 지역 언어에 맞는 키워드 "여러 세트"를 각각 검색해 결과를 합친다.
// (좁은 지역부터 검사 — 홍콩/대만/한국을 중국보다 먼저, 베트남/태국을 중국보다 먼저)
function regionQueries(lat, lng) {
  const inBox = (w, s, e, n) => lng >= w && lng <= e && lat >= s && lat <= n
  if (inBox(113.8, 22.1, 114.5, 22.6)) return ['美食 茶餐廳 restaurant', '餐廳']                       // 홍콩 (茶餐廳)
  if (inBox(119.5, 21.8, 122.2, 25.4)) return ['美食 小吃 餐廳', '老店 美食']                          // 대만 (小吃/老店)
  if (inBox(125, 33, 130, 39)) return ['맛집 restaurant', '줄서는 맛집', '노포 현지인 맛집', '내돈내산 맛집', '혼밥'] // 한국
  if (inBox(129, 30, 146, 46)) return ['グルメ レストラン restaurant', '居酒屋 おすすめ']             // 일본 (グルメ/居酒屋)
  if (inBox(97, 5, 105.5, 21)) return ['ร้านอาหาร restaurant', 'street food', 'local food']          // 태국
  if (inBox(102, 8, 110, 24)) return ['restaurant street food', 'local food', 'best restaurant']     // 베트남
  if (inBox(73, 18, 135, 54)) return ['餐厅 美食 restaurant', '必吃 探店 美食']                        // 중국 (必吃榜/探店)
  if (inBox(-125, 24, -66, 50)) return ['must eat restaurant', 'top rated restaurants', 'Eater']     // 미국
  if (inBox(-8, 49.5, 1.8, 59)) return ['restaurant', 'traditional british food']                    // 영국
  if (inBox(-5, 42, 8, 51)) return ['restaurant bistro', 'michelin bib gourmand restaurant']         // 프랑스 (Bistro/빕구르망)
  if (inBox(-9.5, 36, 3.3, 44)) return ['restaurante', 'tapas restaurant']                            // 스페인 (Tapas)
  if (inBox(6.5, 36, 19, 47.2)) return ['ristorante trattoria', 'osteria']                            // 이탈리아 (Trattoria/Osteria)
  return ['restaurant', 'best restaurant']  // 그 외
}
const ICON_BY_CAT = { 한식: '🍲', 고기: '🍖', 횟집: '🐟', 면: '🍜', 카페: '☕', 기타: '🍽️' }
const PALETTE = ['#f3a86b', '#9bcf8a', '#7cb6e8', '#e98f8f', '#c9a3e0', '#e0a35c', '#8fc8a0']
const PRICE = { PRICE_LEVEL_INEXPENSIVE: '₩', PRICE_LEVEL_MODERATE: '₩₩', PRICE_LEVEL_EXPENSIVE: '₩₩₩', PRICE_LEVEL_VERY_EXPENSIVE: '₩₩₩₩' }

export default async function handler(req, res) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    res.status(200).json({ places: [], fallback: true })
    return
  }
  const kw = (req.query?.q || '').toString().trim()
  const cat = (req.query?.cat || '').toString()
  // 검색 영역(bbox=서,남,동,북) 먼저 파싱 (지역별 검색어 결정에 중심좌표 사용)
  const bbox = (req.query?.bbox || '').toString()
  let bw, bs, be, bn
  let hasBbox = false
  if (bbox) {
    const [w, s, e, n] = bbox.split(',').map(Number)
    if ([w, s, e, n].every(Number.isFinite)) { bw = w; bs = s; be = e; bn = n; hasBbox = true }
  }
  // 검색어 세트: 키워드 우선 → 카테고리(영어) → 지역 맞춤 다중 키워드 세트
  let queries
  if (kw) queries = [kw]
  else if (CAT_Q[cat]) queries = [CAT_Q[cat]]
  else queries = hasBbox ? regionQueries((bs + bn) / 2, (bw + be) / 2) : ['맛집 restaurant', '노포 현지인 맛집']

  const openNow = req.query?.open === '1'
  const isGlobal = req.query?.global === '1'
  const restriction = hasBbox
    ? { locationRestriction: { rectangle: { low: { latitude: bs, longitude: bw }, high: { latitude: bn, longitude: be } } } }
    : isGlobal ? {} : { regionCode: 'KR' } // global: 지역 제한 없음(전세계)

  // 키워드 세트마다 검색해서 결과 합치기(중복 제거)
  async function runSearch(textQuery) {
    const body = { textQuery, languageCode: 'ko', maxResultCount: 20, openNow, ...restriction }
    if (!openNow) delete body.openNow
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.primaryType,places.priceLevel,places.photos,places.currentOpeningHours.openNow',
      },
      body: JSON.stringify(body),
    })
    return r.json()
  }

  try {
    const datas = await Promise.all(queries.map((q) => runSearch(q).catch((e) => ({ error: { message: String(e) } }))))
    const seen = new Set()
    const raw = []
    let lastError = null
    for (const data of datas) {
      if (data.error) { lastError = data.error.message; continue }
      for (const p of data.places || []) {
        if (p.id && !seen.has(p.id)) { seen.add(p.id); raw.push(p) }
      }
    }
    if (raw.length === 0 && lastError) {
      res.status(200).json({ places: [], error: lastError })
      return
    }
    const places = raw.map((p, i) => {
      const c = CAT_BY_TYPE[p.primaryType] || '기타'
      const photoRef = p.photos?.[0]?.name
      return {
        id: p.id,
        name: p.displayName?.text || '이름 없음',
        region: p.formattedAddress || '',
        cat: c,
        price: PRICE[p.priceLevel] || '',
        rating: p.rating || 0,
        reviews: p.userRatingCount || 0,
        lng: p.location?.longitude,
        lat: p.location?.latitude,
        color: PALETTE[i % PALETTE.length],
        icon: ICON_BY_CAT[c],
        photo: photoRef ? `/api/photo?ref=${encodeURIComponent(photoRef)}&w=200` : null,
        priceLevel: PRICE[p.priceLevel] ? PRICE[p.priceLevel].length : 0,
        openNow: p.currentOpeningHours?.openNow ?? null,
        reviews_list: [],
      }
    })
    res.status(200).json({ places })
  } catch (e) {
    res.status(200).json({ places: [], error: String(e) })
  }
}
