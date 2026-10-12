// 장소 상세 보강 — 상세 패널 열 때 호출.
//  · GET /api/place?blog=1&name=..&addr=..  → 네이버 블로그 글 수 실시간 조회(저장·CDN 캐시 없음, lib/naver.js 주석 참고)
//  · GET /api/place?id=<googlePlaceId>       → 구글 Place Details (GOOGLE_ENABLED 스위치가 켜졌을 때만)
import { googleKey } from '../lib/gcache.js'
import { blogQuery, blogCount } from '../lib/naver.js'

async function blog(req, res) {
  const name = (req.query?.name || '').toString().slice(0, 60)
  const addr = (req.query?.addr || '').toString().slice(0, 120)
  if (!name) { res.status(200).json({ error: 'no name' }); return }
  const query = blogQuery(name, addr)
  const total = await blogCount(query, process.env.NAVER_CLIENT_ID, process.env.NAVER_CLIENT_SECRET)
  // 특약: 서버 측 보관 금지 → CDN(s-maxage) 캐시 없이 사용자 기기에만 짧게
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.status(200).json({
    total: total >= 0 ? total : null,
    query,
    url: `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(query)}`,
  })
}

export default async function handler(req, res) {
  if (req.query?.blog === '1') return blog(req, res)
  const id = (req.query?.id || '').toString()
  const key = googleKey()
  if (!id || !key) {
    res.status(200).json({ error: 'no id/key' })
    return
  }
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${id}?languageCode=ko&regionCode=KR`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'id,displayName,formattedAddress,shortFormattedAddress,nationalPhoneNumber,websiteUri,googleMapsUri,rating,userRatingCount,primaryType,priceLevel,regularOpeningHours.weekdayDescriptions,regularOpeningHours.openNow,photos.name',
      },
    })
    const d = await r.json()
    if (d.error) {
      res.status(200).json({ error: d.error.message })
      return
    }
    const photos = (d.photos || []).slice(0, 8).map((p) => `/api/photo?ref=${encodeURIComponent(p.name)}&w=400`)
    res.status(200).json({
      id: d.id,
      name: d.displayName?.text || '',
      address: d.formattedAddress || '',
      shortAddress: d.shortFormattedAddress || '',
      phone: d.nationalPhoneNumber || '',
      website: d.websiteUri || '',
      mapsUrl: d.googleMapsUri || '',
      openNow: d.regularOpeningHours?.openNow ?? null,
      hours: d.regularOpeningHours?.weekdayDescriptions || [],
      photos,
    })
  } catch (e) {
    res.status(200).json({ error: String(e) })
  }
}
