// Vercel 서버리스 함수 - Google Places API (New) Text Search 프록시
// 브라우저에서 GET /api/places?q=검색어 로 호출.
// GOOGLE_PLACES_API_KEY 가 없으면 fallback:true 를 반환해 프런트엔드가 목 데이터를 쓰게 합니다.

const CAT_BY_TYPE = {
  korean_restaurant: '한식', barbecue_restaurant: '고기', seafood_restaurant: '횟집',
  noodle_shop: '면', ramen_restaurant: '면', cafe: '카페', coffee_shop: '카페',
}
const ICON_BY_CAT = { 한식: '🍲', 고기: '🍖', 횟집: '🐟', 면: '🍜', 카페: '☕', 기타: '🍽️' }
const PALETTE = ['#f3a86b', '#9bcf8a', '#7cb6e8', '#e98f8f', '#c9a3e0', '#e0a35c', '#8fc8a0']
const PRICE = { PRICE_LEVEL_INEXPENSIVE: '₩', PRICE_LEVEL_MODERATE: '₩₩', PRICE_LEVEL_EXPENSIVE: '₩₩₩', PRICE_LEVEL_VERY_EXPENSIVE: '₩₩₩₩' }

export default async function handler(req, res) {
  const q = (req.query?.q || '전국 맛집').toString()
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    res.status(200).json({ places: [], fallback: true })
    return
  }
  // 검색 영역 제한(bbox=서,남,동,북). 있으면 해당 국가/지역으로 한정, 없으면 한국(KR) 기본.
  const body = { textQuery: q, languageCode: 'ko', maxResultCount: 20 }
  if (req.query?.open === '1') body.openNow = true // 영업 중만
  const bbox = (req.query?.bbox || '').toString()
  if (bbox) {
    const [w, s, e, n] = bbox.split(',').map(Number)
    if ([w, s, e, n].every(Number.isFinite)) {
      body.locationRestriction = {
        rectangle: { low: { latitude: s, longitude: w }, high: { latitude: n, longitude: e } },
      }
    }
  } else {
    body.regionCode = 'KR'
  }
  try {
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
    const data = await r.json()
    if (data.error) {
      res.status(200).json({ places: [], error: data.error.message })
      return
    }
    const places = (data.places || []).map((p, i) => {
      const cat = CAT_BY_TYPE[p.primaryType] || '기타'
      const photoRef = p.photos?.[0]?.name
      return {
        id: p.id,
        name: p.displayName?.text || '이름 없음',
        region: p.formattedAddress || '',
        cat,
        price: PRICE[p.priceLevel] || '',
        rating: p.rating || 0,
        reviews: p.userRatingCount || 0,
        lng: p.location?.longitude,
        lat: p.location?.latitude,
        color: PALETTE[i % PALETTE.length],
        icon: ICON_BY_CAT[cat],
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
