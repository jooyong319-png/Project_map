// 검색 자동완성 — 카카오. 자연어성 입력을 똑똑하게 처리한다.
//  · "근처/주변 맛집"      → 지금 보는 위치 주변에서 검색
//  · "천안 맛집" "개봉 맛집" "강남구 논현동 파스타" → 앞을 지역으로 잡아 그 동네에서 검색(분할 여러 번 시도)
//  · "천안 롯데리아"       → 지역(천안)에서 롯데리아
//  · "롯데리아 천안점" "우래옥" → 전국 이름/브랜드 검색(한 단어면 현재 근처 우선)
//  · 현재 카테고리에서 없으면 전 카테고리로 한 번 더 시도(음식 모드라도 '경복궁' 나오게)
// GET /api/suggest?q=...&kind=...&bbox=... → { results: [{ id,name,region,cat,icon,lng,lat,kind }] }

import { catFromKakao, ICON_BY_CAT, KIND_ICON, catCodeOf, CAT_KIND } from './kakao.js'

const KAKAO = 'https://dapi.kakao.com/v2/local'
const NEAR = /^(근처|주변|내\s*근처|이\s*근처|가까운|가까이)\s*/

function mapDoc(p, kind) {
  // kind='all' 이거나 미지정이면 카카오 카테고리 코드로 종류 추론(아이콘 맞추기)
  const pk = (!kind || kind === 'all') ? (CAT_KIND[p.category_group_code] || 'food') : kind
  const c = pk === 'food' ? catFromKakao(p.category_name) : (p.category_name?.split('>').pop()?.trim() || '')
  return {
    id: 'k_' + p.id,
    name: p.place_name || '',
    region: p.road_address_name || p.address_name || '',
    cat: c,
    icon: pk === 'food' ? ICON_BY_CAT[c] : (KIND_ICON[pk] || '📍'),
    lng: Number(p.x),
    lat: Number(p.y),
    kind: pk,
  }
}

// 지역명 → 좌표(+검색 반경 d). 시/구/동 단위가 아니면 null.
async function geocodeRegion(q, key) {
  const r = await fetch(`${KAKAO}/search/address.json?size=1&query=${encodeURIComponent(q)}`, { headers: { Authorization: `KakaoAK ${key}` } })
  if (!r.ok) return null
  const doc = (await r.json()).documents?.[0]
  if (!doc) return null
  const a = doc.address || {}
  if (!a.region_2depth_name && !a.region_3depth_name) return null
  const dong = a.region_3depth_name || a.region_3depth_h_name || ''
  const gu = a.region_2depth_name || ''
  return { lng: Number(doc.x), lat: Number(doc.y), d: dong ? 0.015 : gu ? 0.045 : 0.09 }
}

async function keyword(q, key, kind, extra = '') {
  if (!q) return []
  const catf = (kind && kind !== 'all') ? `category_group_code=${catCodeOf(kind)}&` : ''
  const r = await fetch(`${KAKAO}/search/keyword.json?${catf}size=12&query=${encodeURIComponent(q)}${extra}`, { headers: { Authorization: `KakaoAK ${key}` } })
  if (!r.ok) return []
  const d = await r.json()
  return (d.documents || []).map((p) => mapDoc(p, kind)).filter((x) => x.name && Number.isFinite(x.lng))
}

// 현재 카테고리 → (없으면) 전 카테고리 순으로 검색
async function searchBoth(q, key, kind, extra = '') {
  let r = await keyword(q, key, kind, extra)
  if (!r.length && kind && kind !== 'all') r = await keyword(q, key, 'all', extra)
  return r
}

export default async function handler(req, res) {
  const key = process.env.KAKAO_REST_KEY
  const q = (req.query?.q || '').toString().trim()
  const kind = (req.query?.kind || 'food').toString()
  if (!key || q.length < 1) { res.status(200).json({ results: [] }); return }

  // 현재 지도 중심(근처 검색·근접 우선용)
  let cx, cy
  const bbox = (req.query?.bbox || '').toString()
  if (bbox) {
    const [w, s, e, n] = bbox.split(',').map(Number)
    if ([w, s, e, n].every(Number.isFinite)) { cx = (w + e) / 2; cy = (s + n) / 2 }
  }

  try {
    const tokens = q.split(/\s+/).filter(Boolean)

    // A) "근처/주변 + 키워드" → 현재 위치 주변
    if (NEAR.test(q) && cx != null) {
      const kw = q.replace(NEAR, '').trim() || '맛집'
      const r = await searchBoth(kw, key, kind, `&x=${cx}&y=${cy}&radius=10000&sort=distance`)
      if (r.length) { res.status(200).json({ results: r }); return }
    }

    // B) "지역 + 키워드" → 분할 지점을 긴 지역부터 시도(최대 3번)
    if (tokens.length >= 2) {
      const start = tokens.length - 1
      const end = Math.max(1, tokens.length - 3)
      for (let i = start; i >= end; i--) {
        const region = tokens.slice(0, i).join(' ')
        const kw = tokens.slice(i).join(' ')
        const geo = await geocodeRegion(region, key)
        if (geo) {
          const rect = `&rect=${geo.lng - geo.d},${geo.lat - geo.d},${geo.lng + geo.d},${geo.lat + geo.d}`
          const r = await searchBoth(kw, key, kind, rect)
          if (r.length) { res.status(200).json({ results: r }); return }
        }
      }
    }

    // C) 일반 이름/브랜드 검색 — 한 단어면 현재 근처 우선, 여러 단어면 정확도순(전국)
    const bias = (tokens.length === 1 && cx != null) ? `&x=${cx}&y=${cy}&radius=20000&sort=distance` : ''
    res.status(200).json({ results: await searchBoth(q, key, kind, bias) })
  } catch (_) {
    res.status(200).json({ results: [] })
  }
}
