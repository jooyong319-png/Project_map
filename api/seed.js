// 태그 필터 검색 엔드포인트 — 저장된 seed(공공데이터 기반)에서 태그(AND)+지도영역으로 거른다.
// GET /api/seed?kind=food&tags=노포&bbox=서,남,동,북
//  · 예전의 '라이브 스캔'(카카오 수집 → 네이버 블로그 태깅 → 저장)은 제거했다.
//    카카오(장소ID·place_url 외 저장 불가)·네이버 검색 API(파생물 저장·AI 입력·수익화 금지) 약관 때문.
//    → seed 에는 저장·AI 입력이 허용된 공공데이터만 넣는다 (wiki/브리프.md "약관 확인 결과").
//  · 평점·사진(구글)은 GOOGLE_ENABLED 스위치가 켜졌을 때만 보강.

import { enrichWithGoogle } from './kakao.js'
import { cachedEnrich, googleKey } from '../lib/gcache.js'
import { seedAll } from '../lib/store.js'

export default async function handler(req, res) {
  const gkey = googleKey()
  const kind = (req.query?.kind || 'food').toString()
  const tags = (req.query?.tags || '').toString().split(',').map((s) => s.trim()).filter(Boolean)
  const bbox = (req.query?.bbox || '').toString()
  let box = null
  if (bbox) {
    const [w, s, e, n] = bbox.split(',').map(Number)
    if ([w, s, e, n].every(Number.isFinite)) box = { w, s, e, n }
  }
  const enrichN = Math.min(Math.max(parseInt(req.query?.enrich, 10) || 0, 0), 50)

  let list = await seedAll(kind)
  if (tags.length) list = list.filter((p) => tags.every((t) => p.tags?.includes(t)))
  if (box) list = list.filter((p) => p.lng >= box.w && p.lng <= box.e && p.lat >= box.s && p.lat <= box.n)

  let places = list.map((p) => ({
    id: p.id, name: p.name, region: p.region, cat: p.cat, lng: p.lng, lat: p.lat,
    icon: p.icon, place_url: p.place_url, tags: p.tags || [], licensed: p.licensed || '',
    rating: 0, reviews: 0,
    price: '', priceLevel: 0, photo: null, openNow: null, reviews_list: [], phone: '', gid: null, source: 'kakao',
  }))

  if (gkey && enrichN > 0) places = await cachedEnrich(places, enrichN, (it) => enrichWithGoogle(it, gkey))

  res.status(200).json({ places })
}
