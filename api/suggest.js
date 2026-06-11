// 가게 이름 자동완성 — 카카오. 두 가지를 똑똑하게 처리:
//  1) "지역 + 음식"(예: 개봉 짜장) → 지역을 좌표로 바꾼 뒤 그 동네 영역에서 음식 검색
//  2) 그 외(예: 우래옥)           → 전국 키워드 검색(현재 지도 근처 우선)
// GET /api/suggest?q=...&bbox=... → { results: [{ id, name, region, cat, icon, lng, lat }] }

import { catFromKakao, ICON_BY_CAT } from './kakao.js'

const KAKAO = 'https://dapi.kakao.com/v2/local'

function mapDoc(p) {
  const c = catFromKakao(p.category_name)
  return {
    id: 'k_' + p.id,
    name: p.place_name || '',
    region: p.road_address_name || p.address_name || '',
    cat: c,
    icon: ICON_BY_CAT[c],
    lng: Number(p.x),
    lat: Number(p.y),
  }
}

// 지역명 → 좌표(+줌). 주소로 안 잡히면 null.
async function geocodeRegion(q, key) {
  const r = await fetch(`${KAKAO}/search/address.json?size=1&query=${encodeURIComponent(q)}`, { headers: { Authorization: `KakaoAK ${key}` } })
  if (!r.ok) return null
  const d = await r.json()
  const doc = d.documents?.[0]
  if (!doc) return null
  const a = doc.address || {}
  if (!a.region_2depth_name && !a.region_3depth_name) return null // 시/구/동 단위가 아니면 제외
  const dong = a.region_3depth_name || a.region_3depth_h_name || ''
  const gu = a.region_2depth_name || ''
  return { lng: Number(doc.x), lat: Number(doc.y), d: dong ? 0.013 : gu ? 0.035 : 0.08 }
}

async function keyword(q, key, extra = '') {
  const r = await fetch(`${KAKAO}/search/keyword.json?category_group_code=FD6&size=10&query=${encodeURIComponent(q)}${extra}`, { headers: { Authorization: `KakaoAK ${key}` } })
  if (!r.ok) return []
  const d = await r.json()
  return (d.documents || []).map(mapDoc).filter((x) => x.name && Number.isFinite(x.lng))
}

export default async function handler(req, res) {
  const key = process.env.KAKAO_REST_KEY
  const q = (req.query?.q || '').toString().trim()
  if (!key || q.length < 1) { res.status(200).json({ results: [] }); return }

  try {
    const tokens = q.split(/\s+/).filter(Boolean)
    // 1) "지역 + 음식" 시도: 마지막 토큰을 음식, 앞부분을 지역으로 보고 지역이 좌표로 잡히면 그 동네에서 음식 검색
    if (tokens.length >= 2) {
      const food = tokens[tokens.length - 1]
      const region = tokens.slice(0, -1).join(' ')
      const geo = await geocodeRegion(region, key)
      if (geo) {
        const rect = `&rect=${geo.lng - geo.d},${geo.lat - geo.d},${geo.lng + geo.d},${geo.lat + geo.d}`
        const results = await keyword(food, key, rect)
        if (results.length) { res.status(200).json({ results }); return }
      }
    }
    // 2) 일반 키워드(이름) — 현재 지도 근처 우선
    let bias = ''
    const bbox = (req.query?.bbox || '').toString()
    if (bbox) {
      const [w, s, e, n] = bbox.split(',').map(Number)
      if ([w, s, e, n].every(Number.isFinite)) bias = `&x=${(w + e) / 2}&y=${(s + n) / 2}&radius=20000&sort=distance`
    }
    res.status(200).json({ results: await keyword(q, key, bias) })
  } catch (_) {
    res.status(200).json({ results: [] })
  }
}
