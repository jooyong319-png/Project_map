// 동네 데이터(정적 JSON) 로더 — scripts/buildArea.mjs 가 만든 src/data/places/<slug>.json.
//  · 공공데이터(인허가·지정/인증·TourAPI)만 담겨 있어 저장·AI 입력이 허용된다 (wiki/브리프.md).
//  · <slug>.picks.json (scripts/aiPick.mjs) 이 있으면 'AI 픽' 태그로 합친다.
//    ⚠️ picks 는 사람 검수 전(reviewed:false)일 수 있다 — 지금은 실험용으로 바로 합침. 공개 전엔 reviewed 만.
//  · DB(Supabase) 없이 코스 후보를 뽑는 기본 소스. 동네를 추가하면 FILES 에 한 줄.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// require 경로는 정적 문자열이어야 Vercel 번들러가 파일을 따라 포함한다
const FILES = {
  seongsu: () => [require('../src/data/places/seongsu.json'), tryReq(() => require('../src/data/places/seongsu.picks.json'))],
  yongsan: () => [require('../src/data/places/yongsan.json'), tryReq(() => require('../src/data/places/yongsan.picks.json'))],
  jongno3: () => [require('../src/data/places/jongno3.json'), tryReq(() => require('../src/data/places/jongno3.picks.json'))],
  itaewon: () => [require('../src/data/places/itaewon.json'), tryReq(() => require('../src/data/places/itaewon.picks.json'))],
  yeonnam: () => [require('../src/data/places/yeonnam.json'), tryReq(() => require('../src/data/places/yeonnam.picks.json'))],
  euljiro: () => [require('../src/data/places/euljiro.json'), tryReq(() => require('../src/data/places/euljiro.picks.json'))],
  songridan: () => [require('../src/data/places/songridan.json'), tryReq(() => require('../src/data/places/songridan.picks.json'))],
  cheonan_buldang: () => [require('../src/data/places/cheonan_buldang.json'), tryReq(() => require('../src/data/places/cheonan_buldang.picks.json'))],
  cheonan_sinbu: () => [require('../src/data/places/cheonan_sinbu.json'), tryReq(() => require('../src/data/places/cheonan_sinbu.picks.json'))],
}
function tryReq(fn) { try { return fn() } catch (_) { return null } }

const cache = {}
export function area(slug) {
  if (!cache[slug] && FILES[slug]) {
    const [a, picks] = FILES[slug]()
    const byPick = new Map((picks?.picks || []).map((p) => [p.id, p]))
    // 원본 객체는 건드리지 않고 복사본에 AI 픽 태그·한 줄 설명(pick)을 붙인다.
    //  인허가 업태로는 카페인지 모르는 곳(예: 어니언=일반음식점)이 많아, AI 픽이 '카페'라 한 곳은 카페로
    cache[slug] = {
      ...a,
      places: a.places.map((p) => {
        const k = byPick.get(p.id)
        if (!k) return p
        return { ...p, tags: [...p.tags, 'AI 픽'], pick: k.why, cat: k.type === '카페' || k.type === '디저트' ? '카페' : p.cat }
      }),
    }
  }
  return cache[slug] || null
}
export const areaSlugs = () => Object.keys(FILES)

const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]

// bbox(서,남,동,북) 안의 장소. kind 지정 시 그 종류만.
export function placesIn(bbox, kind) {
  const out = []
  for (const slug of areaSlugs()) {
    const a = area(slug)
    if (!a || !overlaps(a.bbox, bbox)) continue
    for (const p of a.places) {
      if (kind && p.kind !== kind) continue
      if (p.lng >= bbox[0] && p.lng <= bbox[2] && p.lat >= bbox[1] && p.lat <= bbox[3]) out.push({ ...p, area: slug })
    }
  }
  return out
}

// 이 지점이 속한 동네 slug (범위가 겹치면 지점이 범위 중심에 더 가까운 쪽). 없으면 null
export function areaOf(pt) {
  let best = null, bd = Infinity
  for (const slug of areaSlugs()) {
    const b = area(slug)?.bbox
    if (!b || pt.lng < b[0] || pt.lng > b[2] || pt.lat < b[1] || pt.lat > b[3]) continue
    const d = Math.hypot(pt.lng - (b[0] + b[2]) / 2, pt.lat - (b[1] + b[3]) / 2)
    if (d < bd) { bd = d; best = slug }
  }
  return best
}

// 지점 반경 m 안의 공영 주차장(가까운 순) — scripts/enrichArea.mjs 가 넣은 area.parking
export function parkingNear(at, m = 500) {
  const d = (p) => { const dx = (p.lng - at.lng) * 88000, dy = (p.lat - at.lat) * 111000; return Math.sqrt(dx * dx + dy * dy) }
  const out = []
  for (const slug of areaSlugs()) for (const p of area(slug)?.parking || []) if (d(p) <= m) out.push(p)
  return out.sort((x, y) => d(x) - d(y))
}

// 준비된 동네 목록 (빈 상태 화면용)
export function areaList() {
  return areaSlugs().map((s) => { const a = area(s); return { slug: s, label: a.label, bbox: a.bbox, count: a.places.length } })
}
